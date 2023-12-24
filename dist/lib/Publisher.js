"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Publisher = void 0;
const RabbitMQConnection_1 = require("./RabbitMQConnection");
class Publisher {
    constructor(queueName, options = {}) {
        this.queueName = queueName;
        this.rabbitMQClient = RabbitMQConnection_1.RabbitMQConnection.getClient();
        this.options = options;
    }
}
exports.Publisher = Publisher;
//# sourceMappingURL=Publisher.js.map