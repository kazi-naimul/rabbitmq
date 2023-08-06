import { RabbitMQClient } from "./RabbitMQClient";

export abstract class Consumer {
  protected url: string;
  protected queueName: string;
  protected retry: boolean;
  protected retryCount: number;
  protected retryDelay: number;
  protected rabbitMQClient: RabbitMQClient;

  constructor(
    url: string,
    queueName: string,
    retry = true, // if it is true message will be queued again when there is an error, by default it is false.
    retryCount = 3, // it will retry not more this value, if there is more error it message will be pushed to error queue.
    retryDelay = 0 // it will use this value to as delay value in ms.
  ) {
    this.url = url;
    this.queueName = queueName;
    this.retry = retry;
    this.retryCount = retryCount;
    this.retryDelay = retryDelay;
    this.rabbitMQClient = new RabbitMQClient(this.url);
  }

  abstract execute<MessageType>(message: MessageType): void;

  async consume(): Promise<void> {
    try {
      await this.rabbitMQClient.connect();
      await this.rabbitMQClient.consume(this.queueName, async (message) => {
        try {
          if (message) {
            const messageContent = JSON.parse(message.content.toString());
            await this.execute(messageContent);
          }
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
        } finally {
          await this.rabbitMQClient.ack(message);
        }
      });
    } catch (error) {
      console.error("Error consuming messages:", error);
    }
  }
}
