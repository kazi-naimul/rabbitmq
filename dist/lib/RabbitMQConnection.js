"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RabbitMQConnection = void 0;
const RabbitMQClient_1 = require("./RabbitMQClient");
class RabbitMQConnection {
    static getClient() {
        if (!RabbitMQConnection.rabbitMQClient) {
            throw new Error("RabbitMQ client not initialized. Call connect before accessing the client.");
        }
        return RabbitMQConnection.rabbitMQClient;
    }
    /**
     * Creates the shared client and connects in the background. If the broker is
     * not reachable yet it keeps retrying; publishers wait for it and consumers
     * start once it is up. Never throws and never leaves an unhandled rejection.
     */
    static connect(rabbitMQUrl) {
        if (!RabbitMQConnection.rabbitMQClient) {
            RabbitMQConnection.rabbitMQClient = new RabbitMQClient_1.RabbitMQClient(rabbitMQUrl);
            RabbitMQConnection.rabbitMQClient.connect().catch((error) => {
                console.error("Error connecting to RabbitMQ:", error);
            });
        }
    }
    /** @internal Clears the shared client between tests. */
    static resetForTests() {
        RabbitMQConnection.rabbitMQClient = null;
    }
    static close() {
        if (!RabbitMQConnection.rabbitMQClient) {
            throw new Error("RabbitMQ client not initialized. Call connect before accessing the client.");
        }
        RabbitMQConnection.rabbitMQClient.close().catch((error) => {
            console.error("Error closing RabbitMQ connection:", error);
        });
    }
}
exports.RabbitMQConnection = RabbitMQConnection;
RabbitMQConnection.rabbitMQClient = null;
//# sourceMappingURL=RabbitMQConnection.js.map