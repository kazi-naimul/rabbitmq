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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
// Reconnects and re-subscriptions must run one at a time, in order.
/* eslint-disable no-await-in-loop, no-restricted-syntax */
const amqp = __importStar(require("amqplib"));
const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
class RabbitMQClient {
    constructor(url) {
        this.url = url;
        this.establishing = null;
        this.closedByUser = false;
        // Consumers to re-subscribe after a reconnect.
        this.registrations = [];
        // Which channel delivered a message: acks must go back to that channel, and
        // are skipped once it is gone (the broker redelivers those messages).
        this.deliveredOn = new WeakMap();
        this.url = url;
    }
    /** @internal Clears the shared connection between tests. */
    static resetForTests() {
        RabbitMQClient.connection = null;
        RabbitMQClient.connecting = null;
    }
    getChannel() {
        return this.channel;
    }
    /**
     * Opens the connection and a channel. Retries with backoff until the broker
     * answers, so a broker that is still starting no longer leaves the client
     * broken for the life of the process. Safe to call many times: callers share
     * one attempt, and an open client resolves at once.
     */
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.closedByUser = false;
            if (this.channel)
                return;
            if (!this.establishing) {
                this.establishing = this.establish().finally(() => {
                    this.establishing = null;
                });
            }
            yield this.establishing;
        });
    }
    establish() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            let delay = RabbitMQClient.retryPolicy.minDelayMs;
            for (;;) {
                if (this.closedByUser)
                    return;
                try {
                    const connection = yield RabbitMQClient.sharedConnection(this.url);
                    let channel;
                    try {
                        channel = yield connection.createChannel();
                    }
                    catch (channelError) {
                        // A cached connection that died without a close event (half-open
                        // TCP) would fail every retry; forget it so the next one reconnects.
                        if (RabbitMQClient.connection === connection)
                            RabbitMQClient.connection = null;
                        throw channelError;
                    }
                    channel.on("error", (error) => {
                        console.error("RabbitMQ channel error:", error.message);
                    });
                    channel.on("close", () => this.onChannelClosed(channel));
                    yield this.resubscribe(channel);
                    this.channel = channel;
                    return;
                }
                catch (error) {
                    console.error(`Error connecting to RabbitMQ, retrying in ${delay}ms:`, (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : error);
                    yield sleep(delay);
                    delay = Math.min(delay * 2, RabbitMQClient.retryPolicy.maxDelayMs);
                }
            }
        });
    }
    static sharedConnection(url) {
        if (RabbitMQClient.connection)
            return Promise.resolve(RabbitMQClient.connection);
        if (!RabbitMQClient.connecting) {
            RabbitMQClient.connecting = amqp
                .connect(url)
                .then((connection) => {
                // Without an 'error' listener amqplib's error event would crash the process.
                connection.on("error", (error) => {
                    console.error("RabbitMQ connection error:", error.message);
                });
                connection.on("close", () => {
                    if (RabbitMQClient.connection === connection)
                        RabbitMQClient.connection = null;
                });
                RabbitMQClient.connection = connection;
                return connection;
            })
                .finally(() => {
                RabbitMQClient.connecting = null;
            });
        }
        return RabbitMQClient.connecting;
    }
    // A closed channel (broker restart, network drop, channel error) is replaced
    // in the background; consumers are re-subscribed on the new one.
    onChannelClosed(channel) {
        if (this.channel !== channel)
            return;
        this.channel = undefined;
        if (this.closedByUser)
            return;
        console.error("RabbitMQ channel closed, reconnecting");
        // Next tick: when the whole connection dropped, its channels close before
        // the connection does, and reconnecting now would reuse the dead one.
        setImmediate(() => {
            this.connect().catch(() => undefined);
        });
    }
    resubscribe(channel) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const registration of this.registrations) {
                yield this.subscribe(channel, registration);
            }
        });
    }
    subscribe(channel, registration) {
        return __awaiter(this, void 0, void 0, function* () {
            yield channel.assertQueue(registration.queue, { durable: true });
            // Per-consumer limit (global=false) for the consumer started next. Always
            // set, so one consumer's limit never leaks onto the next on this channel.
            yield channel.prefetch(registration.prefetch, false);
            yield channel.consume(registration.queue, (message) => {
                if (message)
                    this.deliveredOn.set(message, channel);
                return registration.callback(message);
            }, { noAck: false });
        });
    }
    /** Waits for an open channel, starting the connection if nobody has. */
    ready() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.channel)
                return this.channel;
            let timer;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(resolve, RabbitMQClient.retryPolicy.channelWaitMs);
            });
            yield Promise.race([this.connect(), timeout]);
            clearTimeout(timer);
            if (!this.channel) {
                throw new Error(`RabbitMQ is not connected (waited ${RabbitMQClient.retryPolicy.channelWaitMs}ms)`);
            }
            return this.channel;
        });
    }
    /**
     * Runs a channel operation. If the channel or connection died under it (a
     * broker restart whose close event has not been processed yet), waits for
     * the reconnect and runs it once more on the fresh channel.
     */
    withChannel(operation) {
        return __awaiter(this, void 0, void 0, function* () {
            const channel = yield this.ready();
            try {
                yield operation(channel);
            }
            catch (error) {
                if (!RabbitMQClient.isChannelGone(error))
                    throw error;
                if (this.channel === channel)
                    this.onChannelClosed(channel);
                yield operation(yield this.ready());
            }
        });
    }
    static isChannelGone(error) {
        const { name, message } = (error !== null && error !== void 0 ? error : {});
        return (name === "IllegalOperationError" ||
            /Channel (closed|ended)|Connection closed|ECONNRESET|EPIPE/.test(message !== null && message !== void 0 ? message : ""));
    }
    publish(queue_1, message_1) {
        return __awaiter(this, arguments, void 0, function* (queue, message, options = {}) {
            try {
                yield this.withChannel((channel) => __awaiter(this, void 0, void 0, function* () {
                    // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
                    // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
                    const defaultOptions = {
                        exchange: `Exchange_${queue}`,
                        routingKey: queue,
                        delay: 0,
                        exchangeType: "direct",
                        headers: {},
                        persistent: true,
                    };
                    const mergedOptions = Object.assign(Object.assign({}, defaultOptions), options);
                    // Declare the delayed exchange
                    yield channel.assertExchange(`${mergedOptions.exchange}-delayed`, "x-delayed-message", {
                        durable: true,
                        arguments: {
                            "x-delayed-type": mergedOptions.exchangeType,
                        },
                    });
                    // Declare the queue
                    yield channel.assertQueue(queue, { durable: true });
                    // Bind the queue to the delayed exchange with the routing key
                    yield channel.bindQueue(queue, `${mergedOptions.exchange}-delayed`, mergedOptions.routingKey);
                    channel.publish(`${mergedOptions.exchange}-delayed`, mergedOptions.routingKey, Buffer.from(JSON.stringify(message)), {
                        persistent: mergedOptions.persistent,
                        headers: Object.assign(Object.assign({}, mergedOptions.headers), { "x-delay": mergedOptions.delay }),
                    });
                }));
                console.log("Message published:", message);
            }
            catch (error) {
                console.error("Error publishing message:", error);
                throw error;
            }
        });
    }
    sendToQueue(queue_1, message_1) {
        return __awaiter(this, arguments, void 0, function* (queue, message, options = {}) {
            try {
                yield this.withChannel((channel) => __awaiter(this, void 0, void 0, function* () {
                    yield channel.assertQueue(queue, { durable: true });
                    // By default we use following defaultOptions to publish a message. To make sure the message is not consumed by multiple consumer unintentionally we
                    // are keeping routingKey value same as the queue name. This default options will be always overwritten by the given options.
                    const defaultOptions = {
                        exchange: `Exchange_${queue}`,
                        routingKey: queue,
                        delay: 0,
                        exchangeType: "direct",
                        headers: {},
                        persistent: true,
                    };
                    const mergedOptions = Object.assign(Object.assign({}, defaultOptions), options);
                    if (mergedOptions.delay && mergedOptions.delay > 0) {
                        yield channel.assertExchange(`${mergedOptions.exchange}-delayed`, "x-delayed-message", {
                            durable: true,
                            arguments: {
                                "x-delayed-type": mergedOptions.exchangeType,
                            },
                        });
                        yield channel.bindQueue(queue, `${mergedOptions.exchange}-delayed`, mergedOptions.routingKey);
                        const headers = {
                            "x-delay": mergedOptions.delay,
                        };
                        let mergedHeader = Object.assign({}, headers);
                        if (options.hasOwnProperty("headers")) {
                            mergedHeader = Object.assign(Object.assign({}, options.headers), headers);
                        }
                        channel.publish(`${mergedOptions.exchange}-delayed`, mergedOptions.routingKey, Buffer.from(JSON.stringify(message)), { persistent: mergedOptions.persistent, headers: mergedHeader });
                    }
                    else {
                        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), Object.assign(Object.assign({}, options), { persistent: mergedOptions.persistent }));
                    }
                }));
                console.log("Message sent to queue:", queue);
            }
            catch (error) {
                console.error("Error sending message to queue:", error);
                throw error;
            }
        });
    }
    /**
     * Consumes a queue. The subscription survives reconnects: after the broker
     * comes back, it is re-established on the new channel.
     */
    consume(queue_1, callback_1) {
        return __awaiter(this, arguments, void 0, function* (queue, callback, options = {}) {
            var _a;
            try {
                const channel = yield this.ready();
                const registration = { queue, callback, prefetch: (_a = options.prefetch) !== null && _a !== void 0 ? _a : 0 };
                this.registrations.push(registration);
                yield this.subscribe(channel, registration);
                console.log("Consuming messages from queue:", queue);
            }
            catch (error) {
                console.error("Error consuming messages:", error);
                throw error;
            }
        });
    }
    // The channel a message must be settled on, or null when that channel is
    // gone (the broker has already put the message back on the queue).
    settleChannel(message) {
        var _a;
        const channel = (_a = this.deliveredOn.get(message)) !== null && _a !== void 0 ? _a : this.channel;
        return channel && channel === this.channel ? channel : null;
    }
    ack(message) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!message)
                    return;
                const channel = this.settleChannel(message);
                if (channel)
                    channel.ack(message);
            }
            catch (error) {
                console.error(error);
                throw error;
            }
        });
    }
    nack(message_1) {
        return __awaiter(this, arguments, void 0, function* (message, requeue = true) {
            if (!message)
                return;
            const channel = this.settleChannel(message);
            if (channel)
                channel.nack(message, false, requeue);
        });
    }
    getConsumerCount(queue) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const channel = yield this.ready();
                const { consumerCount } = yield channel.assertQueue(queue, {
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
            this.closedByUser = true;
            try {
                const { channel } = this;
                this.channel = undefined;
                if (channel) {
                    yield channel.close();
                }
                if (RabbitMQClient.connection) {
                    const { connection } = RabbitMQClient;
                    RabbitMQClient.connection = null;
                    yield connection.close();
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
/**
 * Reconnect and wait timings. The defaults suit production; change them only
 * if your broker restarts take longer than half a minute.
 */
RabbitMQClient.retryPolicy = {
    /** First wait after a failed connect; doubles up to maxDelayMs. */
    minDelayMs: 1000,
    maxDelayMs: 30000,
    /** How long publish/sendToQueue wait for a connection before failing. */
    channelWaitMs: 30000,
};
// One TCP connection per process, shared by every client, as before.
RabbitMQClient.connection = null;
RabbitMQClient.connecting = null;
//# sourceMappingURL=RabbitMQClient.js.map