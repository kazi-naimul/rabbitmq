import { RabbitMQClient } from "./RabbitMQClient";
export declare abstract class Publisher {
    protected queueName: string;
    protected options: object;
    protected rabbitMQClient: RabbitMQClient;
    constructor(queueName: string, options?: {});
    abstract publish<MessageType extends object>(message: MessageType): void;
}
