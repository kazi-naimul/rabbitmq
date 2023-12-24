import { RabbitMQClient } from "./RabbitMQClient";
export declare class RabbitMQConnection {
    private static rabbitMQClient;
    static getClient(): RabbitMQClient;
    static connect(rabbitMQUrl: string): void;
    static close(): void;
}
