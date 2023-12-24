"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Consumer = void 0;
const RabbitMQConnection_1 = require("./RabbitMQConnection");
class Consumer {
    constructor(queueName, options = {
        retry: true,
        retry_count: 3,
        retry_delay: 0,
    }) {
        this.queueName = queueName;
        this.retry = options.retry; // if it is true message will be queued again when there is an error, by default it is true.
        this.retryCount = options.retry_count; // it will retry not more this value, if there is more error it message will be pushed to error queue.
        this.retryDelay = options.retry_delay; // it will use this value to as delay value in ms.
        this.rabbitMQClient = RabbitMQConnection_1.RabbitMQConnection.getClient();
    }
    consume() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.rabbitMQClient.connect();
                yield this.rabbitMQClient.consume(this.queueName, (message) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        if (message) {
                            const messageContent = JSON.parse(message.content.toString());
                            yield this.execute(messageContent);
                        }
                        return true;
                    }
                    catch (error) {
                        console.error("Error processing message:", error);
                        if (!this.retry) {
                            return false;
                        }
                        const headers = (message === null || message === void 0 ? void 0 : message.properties.headers) || {};
                        let errorCount = headers.ErrorCount || 0;
                        if (errorCount >= this.retryCount) {
                            try {
                                yield this.rabbitMQClient.sendToQueue(`${this.queueName}_error`, JSON.parse(message.content.toString()), {
                                    delay: this.retryDelay,
                                });
                            }
                            catch (sendError) {
                                console.error("Error sending message to error queue:", sendError);
                            }
                        }
                        else {
                            errorCount += 1;
                            try {
                                yield this.rabbitMQClient.sendToQueue(this.queueName, JSON.parse(message.content.toString()), {
                                    persistent: true,
                                    delay: this.retryDelay,
                                    headers: Object.assign(Object.assign({}, headers), { ErrorCount: errorCount, LastException: error.message }),
                                });
                            }
                            catch (sendError) {
                                console.error("Error requeueing message:", sendError);
                            }
                        }
                        return false;
                    }
                    finally {
                        yield this.rabbitMQClient.ack(message);
                    }
                }));
            }
            catch (error) {
                console.error("Error consuming messages:", error);
            }
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=Consumer.js.map