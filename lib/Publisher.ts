import { RabbitMQClient } from "./RabbitMQClient";
import { RabbitMQConnection } from "./RabbitMQConnection";

export abstract class Publisher {
  protected queueName: string;

  protected options: object;

  protected rabbitMQClient: RabbitMQClient;

  constructor(queueName: string, options = {}) {
    this.queueName = queueName;
    this.rabbitMQClient = RabbitMQConnection.getClient();
    this.options = options;
  }

  abstract publish<MessageType extends object>(message: MessageType): void;
}
