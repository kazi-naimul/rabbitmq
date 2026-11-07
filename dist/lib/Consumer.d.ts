import { RabbitMQClient } from "./RabbitMQClient";
import { ConsumerOptions } from "./type";
export declare abstract class Consumer {
    protected queueName: string;
    protected retry: boolean;
    protected retryCount: number;
    protected retryDelay: number;
    protected rabbitMQClient: RabbitMQClient;
    constructor(queueName: string, options?: ConsumerOptions);
    /** Dead-letter queue for this consumer: messages that could not be processed. */
    protected get deadLetterQueue(): string;
    abstract execute<MessageType extends object>(message: MessageType): void;
    /**
     * Starts consuming. Waits for the broker if it is not reachable yet, and the
     * subscription is restored automatically after a reconnect.
     */
    consume(): Promise<void>;
    private handle;
    private settle;
    private deadLetter;
}
