"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.RabbitMQClient = void 0;
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-self-assign */
const amqp = __importStar(require("amqplib"));
class RabbitMQClient {
    constructor(url) {
        this.url = url;
        this.url = url;
        this.channel = this.channel;
    }
    getChannel() {
        return this.channel;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!RabbitMQClient.connection) {
                    RabbitMQClient.connection = yield amqp.connect(this.url);
                }
                this.channel = yield RabbitMQClient.connection.createChannel();
            }
            catch (error) {
                console.error("Error connecting to RabbitMQ:", error);
                throw error;
            }
        });
    }
    publish(queue, message, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
                // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
                const defaultOptions = {
                    exchange: `Exchange_${queue}`,
                    routingKey: queue,
                    delay: 0,
                    exchangeType: "direct",
                    headers: {},
                };
                const mergedOptions = Object.assign(Object.assign({}, defaultOptions), options);
                // Declare the delayed exchange
                yield this.channel.assertExchange(`${mergedOptions.exchange}-delayed`, "x-delayed-message", {
                    durable: true,
                    arguments: {
                        "x-delayed-type": mergedOptions.exchangeType,
                    },
                });
                // Declare the queue
                yield this.channel.assertQueue(queue, { durable: true });
                // Bind the queue to the delayed exchange with the routing key
                yield this.channel.bindQueue(queue, `${mergedOptions.exchange}-delayed`, mergedOptions.routingKey);
                const delayedMessage = {
                    properties: {
                        headers: Object.assign(Object.assign({}, mergedOptions.headers), { "x-delay": mergedOptions.delay }),
                    },
                    content: Buffer.from(JSON.stringify(message)),
                };
                yield this.channel.publish(`${mergedOptions.exchange}-delayed`, mergedOptions.routingKey, delayedMessage.content, delayedMessage.properties);
                console.log("Message published:", message);
            }
            catch (error) {
                console.error("Error publishing message:", error);
                throw error;
            }
        });
    }
    sendToQueue(queue, message, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.channel.assertQueue(queue, { durable: true });
                // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
                // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
                const defaultOptions = {
                    exchange: `Exchange_${queue}`,
                    routingKey: queue,
                    delay: 0,
                    exchangeType: "direct",
                    headers: {},
                };
                const mergedOptions = Object.assign(Object.assign({}, defaultOptions), options);
                if (mergedOptions.delay && mergedOptions.delay > 0) {
                    yield this.channel.assertExchange(`${mergedOptions.exchange}-delayed`, "x-delayed-message", {
                        durable: true,
                        arguments: {
                            "x-delayed-type": mergedOptions.exchangeType,
                        },
                    });
                    yield this.channel.bindQueue(queue, `${mergedOptions.exchange}-delayed`, mergedOptions.routingKey);
                    const headers = {
                        "x-delay": mergedOptions.delay,
                    };
                    let mergedHeader = Object.assign({}, headers);
                    if (options.hasOwnProperty("headers")) {
                        mergedHeader = Object.assign(Object.assign({}, options.headers), headers);
                    }
                    const delayedMessage = {
                        properties: {
                            headers: mergedHeader,
                        },
                        content: Buffer.from(JSON.stringify(message)),
                    };
                    yield this.channel.publish(`${mergedOptions.exchange}-delayed`, mergedOptions.routingKey, delayedMessage.content, delayedMessage.properties);
                }
                else {
                    yield this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), options);
                }
                console.log("Message sent to queue:", queue);
            }
            catch (error) {
                console.error("Error sending message to queue:", error);
                throw error;
            }
        });
    }
    consume(queue, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.channel.assertQueue(queue, { durable: true });
                yield this.channel.consume(queue, callback, { noAck: false });
                console.log("Consuming messages from queue:", queue);
            }
            catch (error) {
                console.error("Error consuming messages:", error);
                throw error;
            }
        });
    }
    ack(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (message) {
                    if (message) {
                        this.channel.ack(message);
                    }
                }
            }
            catch (error) {
                console.error(error);
                throw error;
            }
        });
    }
    nack(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (message) {
                yield this.channel.nack(message);
            }
        });
    }
    getConsumerCount(queue) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { consumerCount } = yield this.channel.assertQueue(queue, {
                    durable: true,
                });
                console.log(`Consumer count for queue "${queue}": ${consumerCount}`);
                return consumerCount;
            }
            catch (error) {
                console.error("Error getting consumer count:", error);
                throw error;
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.channel) {
                    yield this.channel.close();
                }
                if (RabbitMQClient.connection) {
                    yield RabbitMQClient.connection.close();
                }
                console.log("Disconnected from RabbitMQ");
            }
            catch (error) {
                console.error("Error closing RabbitMQ connection:", error);
                throw error;
            }
        });
    }
}
exports.RabbitMQClient = RabbitMQClient;
//# sourceMappingURL=RabbitMQClient.js.map