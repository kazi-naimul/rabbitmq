import { RabbitMQClient } from "./RabbitMQClient";
import { ConsumerOptions } from "./type";
export declare abstract class Consumer {
    protected queueName: string;
    protected retry: boolean;
    protected retryCount: number;
    protected retryDelay: number;
    protected rabbitMQClient: RabbitMQClient;
    constructor(queueName: string, options?: ConsumerOptions);
    abstract execute<MessageType extends object>(message: MessageType): void;
    consume(): Promise<void>;
}
