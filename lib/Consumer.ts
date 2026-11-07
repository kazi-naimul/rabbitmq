import type { ConsumeMessage } from "amqplib";
import { RabbitMQClient } from "./RabbitMQClient";
import { ConsumerOptions } from "./type";
import { RabbitMQConnection } from "./RabbitMQConnection";

export abstract class Consumer {
  protected queueName: string;

  protected retry: boolean;

  protected retryCount: number;

  protected retryDelay: number;

  protected rabbitMQClient: RabbitMQClient;

  constructor(
    queueName: string,
    options: ConsumerOptions = {
      retry: true,
      retry_count: 3,
      retry_delay: 0,
    }
  ) {
    this.queueName = queueName;
    this.retry = options.retry; // if it is true message will be queued again when there is an error, by default it is true.
    this.retryCount = options.retry_count; // it will retry not more this value, if there is more error it message will be pushed to error queue.
    this.retryDelay = options.retry_delay; // it will use this value to as delay value in ms.
    this.rabbitMQClient = RabbitMQConnection.getClient();
  }

  /** Dead-letter queue for this consumer: messages that could not be processed. */
  protected get deadLetterQueue(): string {
    return `${this.queueName}_error`;
  }

  abstract execute<MessageType extends object>(message: MessageType): void;

  /**
   * Starts consuming. Waits for the broker if it is not reachable yet, and the
   * subscription is restored automatically after a reconnect.
   */
  async consume(): Promise<void> {
    try {
      await this.rabbitMQClient.connect();
      await this.rabbitMQClient.consume(this.queueName, (message) =>
        this.handle(message)
      );
    } catch (error) {
      console.error("Error consuming messages:", error);
    }
  }

  private async handle(message: ConsumeMessage | null): Promise<void> {
    if (!message) return; // the broker cancelled the consumer; it resubscribes on reconnect

    let content: object;
    try {
      content = JSON.parse(message.content.toString());
    } catch (parseError) {
      // A message that can never be parsed would fail every retry: dead-letter it as-is.
      await this.settle(message, () =>
        this.deadLetter(
          message,
          message.content.toString(),
          parseError as Error
        )
      );
      return;
    }

    try {
      await this.execute(content);
      await this.rabbitMQClient.ack(message);
    } catch (error: any) {
      console.error("Error processing message:", error);
      const headers = message.properties.headers || {};
      const errorCount = Number(headers.ErrorCount || 0);
      await this.settle(message, () =>
        this.retry && errorCount < this.retryCount
          ? this.rabbitMQClient.sendToQueue(this.queueName, content, {
              persistent: true,
              delay: this.retryDelay,
              headers: {
                ...headers,
                ErrorCount: errorCount + 1,
                LastException: error?.message,
              },
            })
          : this.deadLetter(message, content, error, errorCount)
      );
    }
  }

  // Acks only once the message is safely requeued or dead-lettered. If that
  // fails it goes back to the queue instead of being lost.
  private async settle(
    message: ConsumeMessage,
    forward: () => Promise<void>
  ): Promise<void> {
    try {
      await forward();
      await this.rabbitMQClient.ack(message);
    } catch (forwardError) {
      console.error(
        "Could not requeue or dead-letter message, returning it to the queue:",
        forwardError
      );
      await this.rabbitMQClient.nack(message, true);
    }
  }

  private deadLetter(
    message: ConsumeMessage,
    content: unknown,
    error: Error,
    errorCount = Number(message.properties.headers?.ErrorCount || 0)
  ): Promise<void> {
    console.error(
      `Moving message to dead-letter queue ${this.deadLetterQueue}:`,
      error?.message
    );
    return this.rabbitMQClient.sendToQueue(this.deadLetterQueue, content, {
      persistent: true,
      headers: {
        ...(message.properties.headers || {}),
        ErrorCount: errorCount,
        LastException: error?.message,
        "x-original-queue": this.queueName,
        "x-failed-at": new Date().toISOString(),
      },
    });
  }
}
