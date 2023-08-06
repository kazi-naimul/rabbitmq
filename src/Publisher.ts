import { RabbitMQClient } from "./RabbitMQClient";

export abstract class Publisher {
  protected url: string;
  protected queueName: string;
  protected options: object;
  protected rabbitMQClient: RabbitMQClient;

  constructor(url: string, queueName: string, options = {}) {
    this.url = url;
    this.queueName = queueName;
    this.rabbitMQClient = new RabbitMQClient(this.url);
    this.options = options;
  }

  abstract publish<MessageType>(message: MessageType): void;
}
