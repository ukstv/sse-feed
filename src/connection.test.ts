import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono, type Handler } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { cors } from "hono/cors";
import { Connection, ReadyState } from "./connection.js";
import { once } from "./typed-event-target.js";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";

let feedID = 0;
let reconnectFeedId = 0;
const APP = new Hono()
  .use("*", cors({ origin: "*" }))
  .get("/feed", (c) =>
    streamSSE(c, async (stream) => {
      let canContinue = true;
      stream.onAbort(() => {
        canContinue = false;
      });
      while (canContinue) {
        await stream.writeSSE({
          data: `It is ${new Date().toISOString()}`,
          event: "time-update",
          id: String(feedID++),
        });
      }
    }),
  )
  .get("/reconnect-feed", async (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: `It is ${new Date().toISOString()}`,
        event: "time-update",
        id: String(reconnectFeedId++),
      });
    });
  });

const server = await FauxServer.listen(APP);

test.after(async () => {
  await server.close();
});

test("get stream", async () => {
  let id = 0;
  const app = new Hono().get("/feed", (c) =>
    streamSSE(c, async (stream) => {
      let canContinue = true;
      stream.onAbort(() => {
        canContinue = false;
      });
      while (canContinue) {
        await stream.writeSSE({
          data: String(id),
          event: "time-update",
          id: String(id++),
        });
      }
    }),
  );
  const server = await FauxServer.listen(app);
  const connection = new Connection(new URL("/feed", server.url), {});
  const stream = connection
    .stream()
    .pipeThrough(BytesToStringTransformer.stream())
    .pipeThrough(SSEChunkTransformer.stream());
  const reader = stream.getReader();
  const a = await reader.read();
  const b = await reader.read();
  assert.equal(a, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
  assert.equal(b, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
  connection.close();
  await server.close();
});

test("follow redirect", async () => {
  let id = 0;
  const app = new Hono()
    .get("/feed", (c) =>
      streamSSE(c, async (stream) => {
        let canContinue = true;
        stream.onAbort(() => {
          canContinue = false;
        });
        while (canContinue) {
          await stream.writeSSE({
            data: String(id),
            event: "time-update",
            id: String(id++),
          });
        }
      }),
    )
    .get("/redirect-301-c", (c) => {
      return c.redirect("/feed", 301);
    })
    .get("/redirect-307-b", (c) => {
      return c.redirect("/redirect-301-c", 307);
    })
    .get("/redirect-302-a", (c) => {
      return c.redirect("/redirect-307-b", 302);
    });
  const server = await FauxServer.listen(app);
  const connection = new Connection(new URL("/redirect-302-a", server.url), {
    redirect: "follow",
  });
  const stream = connection
    .stream()
    .pipeThrough(BytesToStringTransformer.stream())
    .pipeThrough(SSEChunkTransformer.stream());
  const reader = stream.getReader();
  const a = await reader.read();
  const b = await reader.read();
  assert.equal(a, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
  assert.equal(b, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
  connection.close();
  await server.close();
});

test("reconnect if connection is closed by server", async () => {
  let connectionCount = 0;
  const app = new Hono().get("/feed", (c) =>
    streamSSE(c, async (stream) => {
      connectionCount += 1;
      await stream.writeSSE({
        data: new Date().toISOString(),
        event: "time-update",
        id: String(connectionCount),
      });
      await stream.close();
    }),
  );
  const server = await FauxServer.listen(app);
  const connection = new Connection(new URL("/feed", server.url), {
    redirect: "follow",
  });
  const stream = connection.stream();
  const reader = stream.getReader();
  await reader.read();
  assert.equal(connectionCount, 1);
  await reader.read();
  assert.equal(connectionCount, 2);
  await reader.read();
  assert.equal(connectionCount, 3);
  connection.close();
  await server.close();
});

test("no reconnect on 204 no content", async () => {
  let connectionCount = 0;
  const MAX_CONNECTIONS_TILL_NO_CONTENT = 3;
  const app = new Hono().get("/feed", (c) => {
    connectionCount += 1;
    if (connectionCount > MAX_CONNECTIONS_TILL_NO_CONTENT) {
      return c.text("No content", 204);
    }
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: new Date().toISOString(),
        event: "time-update",
        id: String(connectionCount),
      });
      await stream.close();
    });
  });
  const server = await FauxServer.listen(app);
  const connection = new Connection(new URL("/feed", server.url), {
    redirect: "follow",
  });
  const stream = connection
    .stream()
    .pipeThrough(BytesToStringTransformer.stream())
    .pipeThrough(SSEChunkTransformer.stream());
  const reader = stream.getReader();
  // Read MAX_CONNECTIONS_TILL_NO_CONTENT values
  for (let i = 0; i < MAX_CONNECTIONS_TILL_NO_CONTENT; i++) {
    const read = await reader.read();
    assert.equal(read.done, false);
    assert.ok(read.value);
    assert.equal(connectionCount, i + 1);
  }
  // And now we get 204 no content
  const read4 = await reader.read();
  assert.equal(read4.done, true);
  assert.not.ok(read4.value);
  assert.equal(connectionCount, 4);
  // Just report "done"
  const read5 = await reader.read();
  assert.equal(read5.done, true);
  assert.not.ok(read5.value);
  // And do not reconnect
  assert.equal(connectionCount, 4);
  connection.close();
  await server.close();
});

test.run();
