import * as amqp from "amqplib";
declare type Options = {
    exchange?: string;
    routingKey?: string;
    persistent?: boolean;
    delay?: number;
    exchangeType?: "direct" | "fanout" | "topic";
    headers?: object;
};
type MessageHandler = (message: amqp.ConsumeMessage | null) => void;
export type ConsumeOptions = {
    prefetch?: number;
};
export declare class RabbitMQClient {
    private url;
    /**
     * Reconnect and wait timings. The defaults suit production; change them only
     * if your broker restarts take longer than half a minute.
     */
    static retryPolicy: {
        /** First wait after a failed connect; doubles up to maxDelayMs. */
        minDelayMs: number;
        maxDelayMs: number;
        /** How long publish/sendToQueue wait for a connection before failing. */
        channelWaitMs: number;
    };
    private static connection;
    private static connecting;
    private channel;
    private establishing;
    private closedByUser;
    private registrations;
    private deliveredOn;
    constructor(url: string);
    /** @internal Clears the shared connection between tests. */
    static resetForTests(): void;
    getChannel(): amqp.Channel;
    /**
     * Opens the connection and a channel. Retries with backoff until the broker
     * answers, so a broker that is still starting no longer leaves the client
     * broken for the life of the process. Safe to call many times: callers share
     * one attempt, and an open client resolves at once.
     */
    connect(): Promise<void>;
    private establish;
    private static sharedConnection;
    private onChannelClosed;
    private resubscribe;
    private subscribe;
    /** Waits for an open channel, starting the connection if nobody has. */
    private ready;
    /**
     * Runs a channel operation. If the channel or connection died under it (a
     * broker restart whose close event has not been processed yet), waits for
     * the reconnect and runs it once more on the fresh channel.
     */
    private withChannel;
    private static isChannelGone;
    publish<MessageType>(queue: string, message: MessageType, options?: Options): Promise<void>;
    sendToQueue<MessageType>(queue: string, message: MessageType, options?: Options): Promise<void>;
    /**
     * Consumes a queue. The subscription survives reconnects: after the broker
     * comes back, it is re-established on the new channel.
     */
    consume(queue: string, callback: MessageHandler, options?: ConsumeOptions): Promise<void>;
    private settleChannel;
    ack(message: amqp.ConsumeMessage | null): Promise<void>;
    nack(message: amqp.ConsumeMessage | null, requeue?: boolean): Promise<void>;
    getConsumerCount(queue: string): Promise<number>;
    close(): Promise<void>;
}
export {};
