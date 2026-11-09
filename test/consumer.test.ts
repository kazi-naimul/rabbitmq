import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fake, tick, message, until } from "./fakeAmqp";
import { RabbitMQClient } from "../lib/RabbitMQClient";
import { RabbitMQConnection } from "../lib/RabbitMQConnection";
import { Consumer } from "../lib/Consumer";

class Jobs extends Consumer {
  handled: any[] = [];
  fail = false;
  constructor(options?: any) {
    super("jobs", options);
  }
  async execute(m: any) {
    if (this.fail) throw new Error("boom");
    this.handled.push(m);
  }
}

const deliver = async (body: unknown, headers: Record<string, unknown> = {}, raw?: string) => {
  const ch = fake.channels().at(-1)!;
  await ch.consumers[0].callback(message(body, headers, raw));
  await tick();
  return ch;
};
const sends = (ch: any) => ch.calls.filter((c: any) => c.method === "sendToQueue");
const acks = (ch: any) => ch.calls.filter((c: any) => c.method === "ack").length;

beforeEach(() => {
  fake.reset();
  RabbitMQClient.resetForTests();
  RabbitMQConnection.resetForTests();
  RabbitMQClient.retryPolicy = { minDelayMs: 1, maxDelayMs: 4, channelWaitMs: 50 };
  RabbitMQConnection.connect("amqp://x");
});

test("RabbitMQConnection.connect with the broker down neither throws nor leaves an unhandled rejection", async () => {
  RabbitMQClient.resetForTests();
  RabbitMQConnection.resetForTests();
  fake.failuresBeforeConnect = 3;
  const unhandled: unknown[] = [];
  const onRejection = (r: unknown) => unhandled.push(r);
  process.on("unhandledRejection", onRejection);
  RabbitMQConnection.connect("amqp://x");
  await until(() => RabbitMQConnection.getClient().getChannel());
  process.off("unhandledRejection", onRejection);
  assert.deepEqual(unhandled, []);
  assert.ok(RabbitMQConnection.getClient().getChannel());
});

test("a handled message is acked", async () => {
  const c = new Jobs();
  await c.consume();
  const ch = await deliver({ id: 1 });
  assert.deepEqual(c.handled, [{ id: 1 }]);
  assert.equal(acks(ch), 1);
});

test("a failure under the retry count is requeued with ErrorCount + 1", async () => {
  const c = new Jobs();
  c.fail = true;
  await c.consume();
  const ch = await deliver({ id: 1 }, { ErrorCount: 1 });
  const [send] = sends(ch);
  assert.equal(send.args[0], "jobs");
  assert.equal(send.args[2].headers.ErrorCount, 2);
  assert.equal(send.args[2].headers.LastException, "boom");
  assert.equal(acks(ch), 1);
});

test("exhausted retries go to the <queue>_error dead-letter queue with failure details", async () => {
  const c = new Jobs();
  c.fail = true;
  await c.consume();
  const ch = await deliver({ id: 1 }, { ErrorCount: 3, trace: "t-1" });
  const [send] = sends(ch);
  assert.equal(send.args[0], "jobs_error");
  assert.deepEqual(JSON.parse(send.args[1].toString()), { id: 1 });
  const h = send.args[2].headers;
  assert.equal(h.trace, "t-1");
  assert.equal(h.ErrorCount, 3);
  assert.equal(h.LastException, "boom");
  assert.equal(h["x-original-queue"], "jobs");
  assert.ok(h["x-failed-at"]);
  assert.equal(send.args[2].persistent, true);
  assert.equal(acks(ch), 1);
});

test("with retry off, a failure goes straight to the dead-letter queue instead of being dropped", async () => {
  const c = new Jobs({ retry: false, retry_count: 3, retry_delay: 0 });
  c.fail = true;
  await c.consume();
  const ch = await deliver({ id: 1 });
  assert.equal(sends(ch)[0].args[0], "jobs_error");
});

test("a message that is not JSON is dead-lettered as-is", async () => {
  const c = new Jobs();
  await c.consume();
  const ch = await deliver(null, {}, "not json{");
  const [send] = sends(ch);
  assert.equal(send.args[0], "jobs_error");
  assert.equal(JSON.parse(send.args[1].toString()), "not json{");
  assert.match(send.args[2].headers.LastException, /JSON/);
  assert.equal(c.handled.length, 0);
  assert.equal(acks(ch), 1);
});

test("if the message cannot be requeued or dead-lettered it goes back to the queue, not lost", async () => {
  const c = new Jobs();
  c.fail = true;
  await c.consume();
  fake.failSendToQueue = true;
  const ch = await deliver({ id: 1 }, { ErrorCount: 3 });
  assert.equal(acks(ch), 0);
  const nack = ch.calls.find((x: any) => x.method === "nack")!;
  assert.equal(nack.args[2], true);
});

test("consume waits for the broker instead of giving up", async () => {
  RabbitMQClient.resetForTests();
  RabbitMQConnection.resetForTests();
  fake.failuresBeforeConnect = 3;
  RabbitMQConnection.connect("amqp://x");
  const c = new Jobs();
  await c.consume();
  await deliver({ id: 7 });
  assert.deepEqual(c.handled, [{ id: 7 }]);
});

const prefetches = (ch: any) => ch.calls.filter((c: any) => c.method === "prefetch").map((c: any) => c.args);

test("a consumer's prefetch is set on the channel before it subscribes", async () => {
  const c = new Jobs({ retry: true, retry_count: 3, retry_delay: 0, prefetch: 5 });
  await c.consume();
  const ch = fake.channels().at(-1)!;
  assert.deepEqual(prefetches(ch), [[5, false]]);
  const order = ch.calls.map((x: any) => x.method);
  assert.ok(order.indexOf("prefetch") < order.indexOf("consume"));
});

test("a consumer without prefetch resets the limit to unlimited", async () => {
  await new Jobs({ retry: true, retry_count: 3, retry_delay: 0, prefetch: 5 }).consume();
  await new Jobs().consume();
  assert.deepEqual(prefetches(fake.channels().at(-1)!), [[5, false], [0, false]]);
});

test("prefetch is restored when the consumer re-subscribes after a reconnect", async () => {
  await new Jobs({ retry: true, retry_count: 3, retry_delay: 0, prefetch: 7 }).consume();
  fake.connections[0].drop();
  await until(() => fake.connections[1]?.channels[0]?.consumers.length);
  assert.deepEqual(prefetches(fake.connections[1].channels[0]), [[7, false]]);
});
