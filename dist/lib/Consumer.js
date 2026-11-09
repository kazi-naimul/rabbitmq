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
        var _a;
        this.queueName = queueName;
        this.retry = options.retry; // if it is true message will be queued again when there is an error, by default it is true.
        this.retryCount = options.retry_count; // it will retry not more this value, if there is more error it message will be pushed to error queue.
        this.retryDelay = options.retry_delay; // it will use this value to as delay value in ms.
        this.prefetch = (_a = options.prefetch) !== null && _a !== void 0 ? _a : 0; // most messages worked on at once; 0 is unlimited.
        this.rabbitMQClient = RabbitMQConnection_1.RabbitMQConnection.getClient();
    }
    /** Dead-letter queue for this consumer: messages that could not be processed. */
    get deadLetterQueue() {
        return `${this.queueName}_error`;
    }
    /**
     * Starts consuming. Waits for the broker if it is not reachable yet, and the
     * subscription is restored automatically after a reconnect.
     */
    consume() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.rabbitMQClient.connect();
                yield this.rabbitMQClient.consume(this.queueName, (message) => this.handle(message), { prefetch: this.prefetch });
            }
            catch (error) {
                console.error("Error consuming messages:", error);
            }
        });
    }
    handle(message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!message)
                return; // the broker cancelled the consumer; it resubscribes on reconnect
            let content;
            try {
                content = JSON.parse(message.content.toString());
            }
            catch (parseError) {
                // A message that can never be parsed would fail every retry: dead-letter it as-is.
                yield this.settle(message, () => this.deadLetter(message, message.content.toString(), parseError));
                return;
            }
            try {
                yield this.execute(content);
                yield this.rabbitMQClient.ack(message);
            }
            catch (error) {
                console.error("Error processing message:", error);
                const headers = message.properties.headers || {};
                const errorCount = Number(headers.ErrorCount || 0);
                yield this.settle(message, () => this.retry && errorCount < this.retryCount
                    ? this.rabbitMQClient.sendToQueue(this.queueName, content, {
                        persistent: true,
                        delay: this.retryDelay,
                        headers: Object.assign(Object.assign({}, headers), { ErrorCount: errorCount + 1, LastException: error === null || error === void 0 ? void 0 : error.message }),
                    })
                    : this.deadLetter(message, content, error, errorCount));
            }
        });
    }
    // Acks only once the message is safely requeued or dead-lettered. If that
    // fails it goes back to the queue instead of being lost.
    settle(message, forward) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield forward();
                yield this.rabbitMQClient.ack(message);
            }
            catch (forwardError) {
                console.error("Could not requeue or dead-letter message, returning it to the queue:", forwardError);
                yield this.rabbitMQClient.nack(message, true);
            }
        });
    }
    deadLetter(message, content, error, errorCount) {
        var _a;
        if (errorCount === void 0) { errorCount = Number(((_a = message.properties.headers) === null || _a === void 0 ? void 0 : _a.ErrorCount) || 0); }
        console.error(`Moving message to dead-letter queue ${this.deadLetterQueue}:`, error === null || error === void 0 ? void 0 : error.message);
        return this.rabbitMQClient.sendToQueue(this.deadLetterQueue, content, {
            persistent: true,
            headers: Object.assign(Object.assign({}, (message.properties.headers || {})), { ErrorCount: errorCount, LastException: error === null || error === void 0 ? void 0 : error.message, "x-original-queue": this.queueName, "x-failed-at": new Date().toISOString() }),
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=Consumer.js.map