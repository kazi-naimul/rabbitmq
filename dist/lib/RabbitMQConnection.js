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
    static connect(rabbitMQUrl) {
        if (!RabbitMQConnection.rabbitMQClient) {
            RabbitMQConnection.rabbitMQClient = new RabbitMQClient_1.RabbitMQClient(rabbitMQUrl);
            // Additional connection logic if needed
            RabbitMQConnection.rabbitMQClient.connect();
        }
    }
    static close() {
        if (!RabbitMQConnection.rabbitMQClient) {
            throw new Error("RabbitMQ client not initialized. Call connect before accessing the client.");
        }
        RabbitMQConnection.rabbitMQClient.close();
    }
}
exports.RabbitMQConnection = RabbitMQConnection;
RabbitMQConnection.rabbitMQClient = null;
//# sourceMappingURL=RabbitMQConnection.js.map