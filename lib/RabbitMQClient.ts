/* eslint-disable no-prototype-builtins */
// Reconnects and re-subscriptions must run one at a time, in order.
/* eslint-disable no-await-in-loop, no-restricted-syntax */
import * as amqp from "amqplib";

declare type Options = {
  exchange?: string;
  routingKey?: string;
  persistent?: boolean;
  delay?: number;
  exchangeType?: "direct" | "fanout" | "topic";
  headers?: object;
};

type MessageHandler = (message: amqp.ConsumeMessage | null) => void;

type Registration = {
  queue: string;
  callback: MessageHandler;
  prefetch: number;
};

export type ConsumeOptions = { prefetch?: number };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export class RabbitMQClient {
  /**
   * Reconnect and wait timings. The defaults suit production; change them only
   * if your broker restarts take longer than half a minute.
   */
  static retryPolicy = {
    /** First wait after a failed connect; doubles up to maxDelayMs. */
    minDelayMs: 1000,
    maxDelayMs: 30000,
    /** How long publish/sendToQueue wait for a connection before failing. */
    channelWaitMs: 30000,
  };

  // One TCP connection per process, shared by every client, as before.
  private static connection: amqp.Connection | null = null;

  private static connecting: Promise<amqp.Connection> | null = null;

  private channel: amqp.Channel;

  private establishing: Promise<void> | null = null;

  private closedByUser = false;

  // Consumers to re-subscribe after a reconnect.
  private registrations: Registration[] = [];

  // Which channel delivered a message: acks must go back to that channel, and
  // are skipped once it is gone (the broker redelivers those messages).
  private deliveredOn = new WeakMap<object, amqp.Channel>();

  public constructor(private url: string) {
    this.url = url;
  }

  /** @internal Clears the shared connection between tests. */
  static resetForTests(): void {
    RabbitMQClient.connection = null;
    RabbitMQClient.connecting = null;
  }

  getChannel(): amqp.Channel {
    return this.channel;
  }

  /**
   * Opens the connection and a channel. Retries with backoff until the broker
   * answers, so a broker that is still starting no longer leaves the client
   * broken for the life of the process. Safe to call many times: callers share
   * one attempt, and an open client resolves at once.
   */
  async connect(): Promise<void> {
    this.closedByUser = false;
    if (this.channel) return;
    if (!this.establishing) {
      this.establishing = this.establish().finally(() => {
        this.establishing = null;
      });
    }
    await this.establishing;
  }

  private async establish(): Promise<void> {
    let delay = RabbitMQClient.retryPolicy.minDelayMs;
    for (;;) {
      if (this.closedByUser) return;
      try {
        const connection = await RabbitMQClient.sharedConnection(this.url);
        let channel: amqp.Channel;
        try {
          channel = await connection.createChannel();
        } catch (channelError) {
          // A cached connection that died without a close event (half-open
          // TCP) would fail every retry; forget it so the next one reconnects.
          if (RabbitMQClient.connection === connection)
            RabbitMQClient.connection = null;
          throw channelError;
        }
        channel.on("error", (error: Error) => {
          console.error("RabbitMQ channel error:", error.message);
        });
        channel.on("close", () => this.onChannelClosed(channel));
        await this.resubscribe(channel);
        this.channel = channel;
        return;
      } catch (error) {
        console.error(
          `Error connecting to RabbitMQ, retrying in ${delay}ms:`,
          (error as Error)?.message ?? error
        );
        await sleep(delay);
        delay = Math.min(delay * 2, RabbitMQClient.retryPolicy.maxDelayMs);
      }
    }
  }

  private static sharedConnection(url: string): Promise<amqp.Connection> {
    if (RabbitMQClient.connection)
      return Promise.resolve(RabbitMQClient.connection);
    if (!RabbitMQClient.connecting) {
      RabbitMQClient.connecting = amqp
        .connect(url)
        .then((connection) => {
          // Without an 'error' listener amqplib's error event would crash the process.
          connection.on("error", (error: Error) => {
            console.error("RabbitMQ connection error:", error.message);
          });
          connection.on("close", () => {
            if (RabbitMQClient.connection === connection)
              RabbitMQClient.connection = null;
          });
          RabbitMQClient.connection = connection;
          return connection;
        })
        .finally(() => {
          RabbitMQClient.connecting = null;
        });
    }
    return RabbitMQClient.connecting;
  }

  // A closed channel (broker restart, network drop, channel error) is replaced
  // in the background; consumers are re-subscribed on the new one.
  private onChannelClosed(channel: amqp.Channel): void {
    if (this.channel !== channel) return;
    this.channel = undefined as unknown as amqp.Channel;
    if (this.closedByUser) return;
    console.error("RabbitMQ channel closed, reconnecting");
    // Next tick: when the whole connection dropped, its channels close before
    // the connection does, and reconnecting now would reuse the dead one.
    setImmediate(() => {
      this.connect().catch(() => undefined);
    });
  }

  private async resubscribe(channel: amqp.Channel): Promise<void> {
    for (const registration of this.registrations) {
      await this.subscribe(channel, registration);
    }
  }

  private async subscribe(
    channel: amqp.Channel,
    registration: Registration
  ): Promise<void> {
    await channel.assertQueue(registration.queue, { durable: true });
    // Per-consumer limit (global=false) for the consumer started next. Always
    // set, so one consumer's limit never leaks onto the next on this channel.
    await channel.prefetch(registration.prefetch, false);
    await channel.consume(
      registration.queue,
      (message) => {
        if (message) this.deliveredOn.set(message, channel);
        return registration.callback(message);
      },
      { noAck: false }
    );
  }

  /** Waits for an open channel, starting the connection if nobody has. */
  private async ready(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RabbitMQClient.retryPolicy.channelWaitMs);
    });
    await Promise.race([this.connect(), timeout]);
    clearTimeout(timer);
    if (!this.channel) {
      throw new Error(
        `RabbitMQ is not connected (waited ${RabbitMQClient.retryPolicy.channelWaitMs}ms)`
      );
    }
    return this.channel;
  }

  /**
   * Runs a channel operation. If the channel or connection died under it (a
   * broker restart whose close event has not been processed yet), waits for
   * the reconnect and runs it once more on the fresh channel.
   */
  private async withChannel(
    operation: (channel: amqp.Channel) => Promise<void>
  ): Promise<void> {
    const channel = await this.ready();
    try {
      await operation(channel);
    } catch (error) {
      if (!RabbitMQClient.isChannelGone(error)) throw error;
      if (this.channel === channel) this.onChannelClosed(channel);
      await operation(await this.ready());
    }
  }

  private static isChannelGone(error: unknown): boolean {
    const { name, message } = (error ?? {}) as Error;
    return (
      name === "IllegalOperationError" ||
      /Channel (closed|ended)|Connection closed|ECONNRESET|EPIPE/.test(
        message ?? ""
      )
    );
  }

  async publish<MessageType>(
    queue: string,
    message: MessageType,
    options: Options = {}
  ): Promise<void> {
    try {
      await this.withChannel(async (channel) => {
        // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
        // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
        const defaultOptions: Options = {
          exchange: `Exchange_${queue}`,
          routingKey: queue,
          delay: 0,
          exchangeType: "direct",
          headers: {},
          persistent: true,
        };
        const mergedOptions = { ...defaultOptions, ...options };

        // Declare the delayed exchange
        await channel.assertExchange(
          `${mergedOptions.exchange}-delayed`,
          "x-delayed-message",
          {
            durable: true,
            arguments: {
              "x-delayed-type": mergedOptions.exchangeType,
            },
          }
        );

        // Declare the queue
        await channel.assertQueue(queue, { durable: true });

        // Bind the queue to the delayed exchange with the routing key
        await channel.bindQueue(
          queue,
          `${mergedOptions.exchange}-delayed`,
          mergedOptions.routingKey
        );

        channel.publish(
          `${mergedOptions.exchange}-delayed`,
          mergedOptions.routingKey,
          Buffer.from(JSON.stringify(message)),
          {
            persistent: mergedOptions.persistent,
            headers: {
              ...mergedOptions.headers,
              "x-delay": mergedOptions.delay,
            },
          }
        );
      });

      console.log("Message published:", message);
    } catch (error) {
      console.error("Error publishing message:", error);
      throw error;
    }
  }

  async sendToQueue<MessageType>(
    queue: string,
    message: MessageType,
    options: Options = {}
  ) {
    try {
      await this.withChannel(async (channel) => {
        await channel.assertQueue(queue, { durable: true });
        // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
        // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
        const defaultOptions: Options = {
          exchange: `Exchange_${queue}`,
          routingKey: queue,
          delay: 0,
          exchangeType: "direct",
          headers: {},
          persistent: true,
        };
        const mergedOptions = { ...defaultOptions, ...options };
        if (mergedOptions.delay && mergedOptions.delay > 0) {
          await channel.assertExchange(
            `${mergedOptions.exchange}-delayed`,
            "x-delayed-message",
            {
              durable: true,
              arguments: {
                "x-delayed-type": mergedOptions.exchangeType,
              },
            }
          );

          await channel.bindQueue(
            queue,
            `${mergedOptions.exchange}-delayed`,
            mergedOptions.routingKey
          );
          const headers = {
            "x-delay": mergedOptions.delay,
          };
          let mergedHeader = {
            ...headers,
          };

          if (options.hasOwnProperty("headers")) {
            mergedHeader = {
              ...options.headers,
              ...headers,
            };
          }

          channel.publish(
            `${mergedOptions.exchange}-delayed`,
            mergedOptions.routingKey,
            Buffer.from(JSON.stringify(message)),
            { persistent: mergedOptions.persistent, headers: mergedHeader }
          );
        } else {
          channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
            ...options,
            persistent: mergedOptions.persistent,
          });
        }
      });

      console.log("Message sent to queue:", queue);
    } catch (error) {
      console.error("Error sending message to queue:", error);
      throw error;
    }
  }

  /**
   * Consumes a queue. The subscription survives reconnects: after the broker
   * comes back, it is re-established on the new channel.
   */
  async consume(
    queue: string,
    callback: MessageHandler,
    options: ConsumeOptions = {}
  ): Promise<void> {
    try {
      const channel = await this.ready();
      const registration = { queue, callback, prefetch: options.prefetch ?? 0 };
      this.registrations.push(registration);
      await this.subscribe(channel, registration);
      console.log("Consuming messages from queue:", queue);
    } catch (error) {
      console.error("Error consuming messages:", error);
      throw error;
    }
  }

  // The channel a message must be settled on, or null when that channel is
  // gone (the broker has already put the message back on the queue).
  private settleChannel(message: amqp.ConsumeMessage): amqp.Channel | null {
    const channel = this.deliveredOn.get(message) ?? this.channel;
    return channel && channel === this.channel ? channel : null;
  }

  async ack(message: amqp.ConsumeMessage | null): Promise<void> {
    try {
      if (!message) return;
      const channel = this.settleChannel(message);
      if (channel) channel.ack(message);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async nack(
    message: amqp.ConsumeMessage | null,
    requeue = true
  ): Promise<void> {
    if (!message) return;
    const channel = this.settleChannel(message);
    if (channel) channel.nack(message, false, requeue);
  }

  async getConsumerCount(queue: string): Promise<number> {
    try {
      const channel = await this.ready();
      const { consumerCount } = await channel.assertQueue(queue, {
        durable: true,
      });
      console.log(`Consumer count for queue "${queue}": ${consumerCount}`);
      return consumerCount;
    } catch (error) {
      console.error("Error getting consumer count:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.closedByUser = true;
    try {
      const { channel } = this;
      this.channel = undefined as unknown as amqp.Channel;
      if (channel) {
        await channel.close();
      }
      if (RabbitMQClient.connection) {
        const { connection } = RabbitMQClient;
        RabbitMQClient.connection = null;
        await connection.close();
      }
      console.log("Disconnected from RabbitMQ");
    } catch (error) {
      console.error("Error closing RabbitMQ connection:", error);
      throw error;
    }
  }
}
