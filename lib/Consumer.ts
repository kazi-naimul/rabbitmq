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

  abstract execute<MessageType extends object>(message: MessageType): void;

  async consume(): Promise<void> {
    try {
      await this.rabbitMQClient.connect();
      await this.rabbitMQClient.consume(this.queueName, async (message) => {
        try {
          if (message) {
            const messageContent = JSON.parse(message.content.toString());
            await this.execute(messageContent);
          }
          return true;
        } catch (error: any) {
          console.error("Error processing message:", error);

          if (!this.retry) {
            return false;
          }

          const headers = message?.properties.headers || {};
          let errorCount = headers.ErrorCount || 0;
          if (errorCount >= this.retryCount) {
            try {
              await this.rabbitMQClient.sendToQueue(
                `${this.queueName}_error`,
                JSON.parse(message.content.toString()),
                {
                  delay: this.retryDelay,
                }
              );
            } catch (sendError) {
              console.error("Error sending message to error queue:", sendError);
            }
          } else {
            errorCount += 1;
            try {
              await this.rabbitMQClient.sendToQueue(
                this.queueName,
                JSON.parse(message.content.toString()),
                {
                  persistent: true,
                  delay: this.retryDelay,
                  headers: {
                    ...headers,
                    ErrorCount: errorCount,
                    LastException: error.message,
                  },
                }
              );
            } catch (sendError) {
              console.error("Error requeueing message:", sendError);
            }
          }
          return false;
        } finally {
          await this.rabbitMQClient.ack(message);
        }
      });
    } catch (error) {
      console.error("Error consuming messages:", error);
    }
  }
}
