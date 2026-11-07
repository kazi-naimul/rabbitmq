import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fake, tick, message, until } from "./fakeAmqp";
import { RabbitMQClient } from "../lib/RabbitMQClient";

beforeEach(() => {
  fake.reset();
  RabbitMQClient.resetForTests();
  RabbitMQClient.retryPolicy = { minDelayMs: 1, maxDelayMs: 4, channelWaitMs: 50 };
});

test("connect keeps retrying until the broker answers", async () => {
  fake.failuresBeforeConnect = 3;
  const client = new RabbitMQClient("amqp://x");
  await client.connect();
  assert.equal(fake.connectAttempts, 4);
  assert.ok(client.getChannel());
});

test("concurrent connects share one attempt and one channel", async () => {
  const client = new RabbitMQClient("amqp://x");
  await Promise.all([client.connect(), client.connect(), client.connect()]);
  assert.equal(fake.connectAttempts, 1);
  assert.equal(fake.channels().length, 1);
});

test("publish called before the broker is up waits for the connection", async () => {
  fake.failuresBeforeConnect = 2;
  const client = new RabbitMQClient("amqp://x");
  void client.connect();
  await client.publish("q", { a: 1 });
  const ch = fake.channels().at(-1)!;
  const pub = ch.calls.find((c) => c.method === "publish")!;
  assert.equal(pub.args[0], "Exchange_q-delayed");
  assert.deepEqual(JSON.parse(pub.args[2].toString()), { a: 1 });
});

test("publish fails with a clear error when the broker stays down", async () => {
  fake.failuresBeforeConnect = 1000;
  const client = new RabbitMQClient("amqp://x");
  void client.connect();
  await assert.rejects(client.publish("q", { a: 1 }), /RabbitMQ is not connected/);
  await client.close();
});

test("publish without an explicit connect starts the connection itself", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.sendToQueue("q", { a: 1 });
  assert.ok(fake.channels()[0].calls.some((c) => c.method === "sendToQueue"));
});

test("messages are persistent unless the caller says otherwise", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.publish("q", { a: 1 });
  await client.sendToQueue("q", { a: 1 });
  await client.sendToQueue("q", { a: 1 }, { persistent: false });
  const ch = fake.channels()[0];
  assert.equal(ch.calls.find((c) => c.method === "publish")!.args[3].persistent, true);
  const sends = ch.calls.filter((c) => c.method === "sendToQueue");
  assert.equal(sends[0].args[2].persistent, true);
  assert.equal(sends[1].args[2].persistent, false);
});

test("a lost connection reconnects and re-subscribes consumers", async () => {
  const client = new RabbitMQClient("amqp://x");
  const seen: string[] = [];
  await client.consume("jobs", (m) => { if (m) seen.push(m.content.toString()); });

  fake.connections[0].drop();
  await until(() => fake.connections[1]?.channels[0]?.consumers.length);

  assert.equal(fake.connections.length, 2);
  // Reconnected straight away, not after a failed attempt on the dead connection.
  assert.equal(fake.connectAttempts, 2);
  const fresh = fake.connections[1].channels[0];
  assert.deepEqual(fresh.consumers.map((c) => c.queue), ["jobs"]);
  await fresh.consumers[0].callback(message({ n: 2 }));
  assert.deepEqual(seen, ['{"n":2}']);
});

test("a closed channel alone is replaced on the same connection", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.connect();
  fake.channels()[0].drop();
  await until(() => fake.connections[0].channels.length === 2 && client.getChannel());
  assert.equal(fake.connections.length, 1);
  assert.equal(fake.connections[0].channels.length, 2);
  assert.equal(client.getChannel(), fake.connections[0].channels[1] as any);
});

test("ack of a message from a channel that has since died is skipped", async () => {
  const client = new RabbitMQClient("amqp://x");
  let delivered: any;
  await client.consume("jobs", (m) => { delivered = m; });
  const old = fake.channels()[0];
  await old.consumers[0].callback(message({ n: 1 }));
  old.drop();
  await until(() => fake.channels().length === 2);

  await client.ack(delivered);

  assert.equal(old.calls.filter((c) => c.method === "ack").length, 0);
  const current = fake.channels().at(-1)!;
  assert.equal(current.calls.filter((c) => c.method === "ack").length, 0);
});

test("ack and nack go to the channel that delivered the message", async () => {
  const client = new RabbitMQClient("amqp://x");
  let delivered: any;
  await client.consume("jobs", (m) => { delivered = m; });
  const ch = fake.channels()[0];
  await ch.consumers[0].callback(message({ n: 1 }));
  await client.ack(delivered);
  await client.nack(delivered);
  assert.deepEqual(ch.calls.filter((c) => ["ack", "nack"].includes(c.method)).map((c) => c.method), ["ack", "nack"]);
});

test("close stops reconnecting", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.connect();
  await client.close();
  await tick();
  assert.equal(fake.connections.length, 1);
});

test("a publish that hits a channel which just died is retried once on a fresh channel", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.connect();
  const stale = fake.channels()[0];
  // The broker went away but the close event has not been processed yet.
  stale.assertExchange = async () => {
    throw Object.assign(new Error("Channel ended, no reply will be forthcoming"), { name: "IllegalOperationError" });
  };
  fake.connections[0].dead = true;

  await client.publish("q", { a: 1 });

  const fresh = fake.channels().at(-1)!;
  assert.notEqual(fresh, stale);
  assert.ok(fresh.calls.some((c) => c.method === "publish"));
});

test("other publish errors are not retried", async () => {
  const client = new RabbitMQClient("amqp://x");
  await client.connect();
  fake.failPublish = true;
  await assert.rejects(client.publish("q", { a: 1 }), /publish failed/);
  assert.equal(fake.channels().length, 1);
});
