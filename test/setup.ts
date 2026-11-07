// Swap amqplib for the in-memory fake before the library is loaded.
import * as fakeModule from "./fakeAmqp";

const id = require.resolve("amqplib");
require.cache[id] = { id, filename: id, loaded: true, exports: fakeModule } as any;
