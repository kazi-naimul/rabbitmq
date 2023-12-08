import * as amqp from "amqplib";

declare type Options = {
  exchange?: string;
  routingKey?: string;
  persistent?: boolean;
  delay?: number;
  exchangeType?: "direct" | "fanout" | "topic";
  headers?: object;
};
export class RabbitMQClient {
  private static connection: amqp.Connection;
  private channel: amqp.Channel;

  public constructor(private url: string) {
    this.url = url;
    this.channel = this.channel;
  }

  getChannel(): amqp.Channel {
    return this.channel;
  }

  async connect(): Promise<void> {
    try {
      if (!RabbitMQClient.connection) {
        RabbitMQClient.connection = await amqp.connect(this.url);
      }
      this.channel = await RabbitMQClient.connection.createChannel();
    } catch (error) {
      console.error("Error connecting to RabbitMQ:", error);
      throw error;
    }
  }

  async publish<MessageType>(
    queue: string,
    message: MessageType,
    options: Options = {}
  ): Promise<void> {
    try {
      // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
      // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
      const defaultOptions: Options = {
        exchange: `Exchange_${queue}`,
        routingKey: queue,
        delay: 0,
        exchangeType: "direct",
        headers: {},
      };
      const mergedOptions = { ...defaultOptions, ...options };

      // Declare the delayed exchange
      await this.channel.assertExchange(
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
      await this.channel.assertQueue(queue, { durable: true });

      // Bind the queue to the delayed exchange with the routing key
      await this.channel.bindQueue(
        queue,
        `${mergedOptions.exchange}-delayed`,
        mergedOptions.routingKey
      );

      const delayedMessage: amqp.Message = {
        properties: {
          headers: {
            ...mergedOptions.headers,
            "x-delay": mergedOptions.delay,
          },
        },
        content: Buffer.from(JSON.stringify(message)),
      };

      await this.channel.publish(
        `${mergedOptions.exchange}-delayed`,
        mergedOptions.routingKey,
        delayedMessage.content,
        delayedMessage.properties
      );

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
      await this.channel.assertQueue(queue, { durable: true });
      // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
      // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
      const defaultOptions: Options = {
        exchange: `Exchange_${queue}`,
        routingKey: queue,
        delay: 0,
        exchangeType: "direct",
        headers: {},
      };
      const mergedOptions = { ...defaultOptions, ...options };
      if (mergedOptions.delay && mergedOptions.delay > 0) {
        await this.channel.assertExchange(
          `${mergedOptions.exchange}-delayed`,
          "x-delayed-message",
          {
            durable: true,
            arguments: {
              "x-delayed-type": mergedOptions.exchangeType,
            },
          }
        );

        await this.channel.bindQueue(
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
        const delayedMessage: amqp.Message = {
          properties: {
            headers: mergedHeader,
          },
          content: Buffer.from(JSON.stringify(message)),
        };

        await this.channel.publish(
          `${mergedOptions.exchange}-delayed`,
          mergedOptions.routingKey,
          delayedMessage.content,
          delayedMessage.properties
        );
      } else {
        await this.channel.sendToQueue(
          queue,
          Buffer.from(JSON.stringify(message)),
          options
        );
      }

      console.log("Message sent to queue:", queue);
    } catch (error) {
      console.error("Error sending message to queue:", error);
      throw error;
    }
  }
  async consume(
    queue: string,
    callback: (message: amqp.ConsumeMessage | null) => void
  ): Promise<void> {
    try {
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.consume(queue, callback, { noAck: false });
      console.log("Consuming messages from queue:", queue);
    } catch (error) {
      console.error("Error consuming messages:", error);
      throw error;
    }
  }

  async ack(message: amqp.ConsumeMessage | null): Promise<void> {
    try {
      if (message) {
        if (message) {
          this.channel.ack(message);
        }
      }
    } catch (error) {}
  }
  async nack(message: amqp.ConsumeMessage | null): Promise<void> {
    if (message) {
      await this.channel.nack(message);
    }
  }
  async getConsumerCount(queue: string): Promise<number> {
    try {
      const { consumerCount } = await this.channel.assertQueue(queue, {
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
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (RabbitMQClient.connection) {
        await RabbitMQClient.connection.close();
      }
      console.log("Disconnected from RabbitMQ");
    } catch (error) {
      console.error("Error closing RabbitMQ connection:", error);
      throw error;
    }
  }
}
