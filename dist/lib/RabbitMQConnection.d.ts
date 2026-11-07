import { RabbitMQClient } from "./RabbitMQClient";
export declare class RabbitMQConnection {
    private static rabbitMQClient;
    static getClient(): RabbitMQClient;
    /**
     * Creates the shared client and connects in the background. If the broker is
     * not reachable yet it keeps retrying; publishers wait for it and consumers
     * start once it is up. Never throws and never leaves an unhandled rejection.
     */
    static connect(rabbitMQUrl: string): void;
    /** @internal Clears the shared client between tests. */
    static resetForTests(): void;
    static close(): void;
}
