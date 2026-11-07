import { EventEmitter } from "events";

/** In-memory stand-in for amqplib, installed into require.cache by setup.ts. */
export class FakeChannel extends EventEmitter {
  calls: { method: string; args: any[] }[] = [];
  consumers: { queue: string; callback: (m: any) => any }[] = [];
  closed = false;

  private record(method: string, args: any[]) {
    this.calls.push({ method, args });
  }
  async assertExchange(...args: any[]) { this.record("assertExchange", args); }
  async assertQueue(...args: any[]) { this.record("assertQueue", args); return { consumerCount: this.consumers.length }; }
  async bindQueue(...args: any[]) { this.record("bindQueue", args); }
  publish(...args: any[]) { this.record("publish", args); if (fake.failPublish) throw new Error("publish failed"); return true; }
  sendToQueue(...args: any[]) { this.record("sendToQueue", args); if (fake.failSendToQueue) throw new Error("send failed"); return true; }
  async consume(queue: string, callback: (m: any) => any) {
    this.record("consume", [queue]);
    this.consumers.push({ queue, callback });
    return { consumerTag: `tag-${this.consumers.length}` };
  }
  ack(...args: any[]) { this.record("ack", args); }
  nack(...args: any[]) { this.record("nack", args); }
  async close() { this.closed = true; this.emit("close"); }
  /** Simulates the broker closing the channel (e.g. after a channel error). */
  drop() { this.closed = true; this.emit("close"); }
}

export class FakeConnection extends EventEmitter {
  channels: FakeChannel[] = [];
  dead = false;
  async createChannel() {
    // Like amqplib: a closed connection refuses new channels.
    if (this.dead) throw new Error("Connection closed");
    const ch = new FakeChannel();
    this.channels.push(ch);
    return ch;
  }
  async close() { this.emit("close"); }
  /** Simulates losing the broker: the connection closes, and its channels with it. */
  drop() {
    this.dead = true;
    this.channels.forEach((c) => c.drop());
    this.emit("close");
  }
}

export const fake = {
  failuresBeforeConnect: 0,
  connectAttempts: 0,
  failPublish: false,
  failSendToQueue: false,
  connections: [] as FakeConnection[],
  reset() {
    this.failuresBeforeConnect = 0;
    this.connectAttempts = 0;
    this.failPublish = false;
    this.failSendToQueue = false;
    this.connections = [];
  },
  /** Every channel ever created, newest last. */
  channels(): FakeChannel[] {
    return this.connections.flatMap((c) => c.channels);
  },
};

export async function connect(_url: string) {
  fake.connectAttempts += 1;
  if (fake.failuresBeforeConnect > 0) {
    fake.failuresBeforeConnect -= 1;
    throw new Error("getaddrinfo EAI_AGAIN rabbitmq");
  }
  const conn = new FakeConnection();
  fake.connections.push(conn);
  return conn;
}

export const message = (body: unknown, headers: Record<string, unknown> = {}, raw?: string) => ({
  content: Buffer.from(raw ?? JSON.stringify(body)),
  fields: {},
  properties: { headers },
});

export const tick = () => new Promise((r) => setTimeout(r, 5));

/** Polls until the condition holds or ~500ms pass. */
export const until = async (condition: () => unknown) => {
  for (let i = 0; i < 100 && !condition(); i += 1) await tick();
};
