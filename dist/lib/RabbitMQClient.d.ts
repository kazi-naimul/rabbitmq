import * as amqp from "amqplib";
declare type Options = {
    exchange?: string;
    routingKey?: string;
    persistent?: boolean;
    delay?: number;
    exchangeType?: "direct" | "fanout" | "topic";
    headers?: object;
};
export declare class RabbitMQClient {
    private url;
    private static connection;
    private channel;
    constructor(url: string);
    getChannel(): amqp.Channel;
    connect(): Promise<void>;
    publish<MessageType>(queue: string, message: MessageType, options?: Options): Promise<void>;
    sendToQueue<MessageType>(queue: string, message: MessageType, options?: Options): Promise<void>;
    consume(queue: string, callback: (message: amqp.ConsumeMessage | null) => void): Promise<void>;
    ack(message: amqp.ConsumeMessage | null): Promise<void>;
    nack(message: amqp.ConsumeMessage | null): Promise<void>;
    getConsumerCount(queue: string): Promise<number>;
    close(): Promise<void>;
}
export {};
