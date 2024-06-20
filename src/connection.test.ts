import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { Connection } from "./connection.js";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";
import type { ServerSentEvent } from "./server-sent-event.type.js";
import { makeApp } from "./__tests__/make-app.js";
import { eventCounts } from "./__tests__/eevnt-counts.js";

function sseStream(connection: Connection): ReadableStream<ServerSentEvent> {
  return connection.stream().pipeThrough(BytesToStringTransformer.stream()).pipeThrough(SSEChunkTransformer.stream());
}

test("get stream", () => {
  return FauxServer.with(makeApp(), async (url) => {
    const connection = new Connection(new URL("/feed", url), {});
    const openEvents = eventCounts(connection.events, "open");
    const closeEvents = eventCounts(connection.events, "close");
    const stream = sseStream(connection);
    const reader = stream.getReader();
    const read1 = await reader.read();
    assert.equal(read1, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
    const read2 = await reader.read();
    assert.equal(read2, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
    connection.close();
    assert.equal(openEvents.size, 1);
    assert.equal(closeEvents.size, 0);
  });
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
  await FauxServer.with(app, async (url) => {
    const connection = new Connection(new URL("/redirect-302-a", url), {
      redirect: "follow",
    });
    const openEvents = eventCounts(connection.events, "open");
    const closeEvents = eventCounts(connection.events, "close");
    const stream = sseStream(connection);
    const reader = stream.getReader();
    const a = await reader.read();
    const b = await reader.read();
    assert.equal(a, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
    assert.equal(b, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
    connection.close();
    assert.equal(openEvents.size, 1);
    assert.equal(closeEvents.size, 0);
  });
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
  await FauxServer.with(app, async (url) => {
    const connection = new Connection(new URL("/feed", url), {});
    const openEvents = eventCounts(connection.events, "open");
    const closeEvents = eventCounts(connection.events, "close");
    const stream = connection.stream();
    const reader = stream.getReader();
    assert.equal(openEvents.size, 0);
    assert.equal(closeEvents.size, 0);
    await reader.read();
    assert.equal(connectionCount, 1);
    assert.equal(openEvents.size, 1);
    assert.equal(closeEvents.size, 0);
    await reader.read();
    assert.equal(connectionCount, 2);
    assert.equal(openEvents.size, 2);
    assert.equal(closeEvents.size, 1);
    await reader.read();
    assert.equal(connectionCount, 3);
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 2);
    connection.close();
    assert.equal(connectionCount, 3);
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 2);
  });
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
  await FauxServer.with(app, async (url) => {
    const connection = new Connection(new URL("/feed", url), {
      redirect: "follow",
    });
    const openEvents = eventCounts(connection.events, "open");
    const closeEvents = eventCounts(connection.events, "close");
    const stream = sseStream(connection);
    const reader = stream.getReader();
    // Read MAX_CONNECTIONS_TILL_NO_CONTENT values
    for (let i = 0; i < MAX_CONNECTIONS_TILL_NO_CONTENT; i++) {
      const read = await reader.read();
      assert.equal(read.done, false);
      assert.ok(read.value);
      assert.equal(connectionCount, i + 1);
    }
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 2);
    // And now we get 204 no content
    const read4 = await reader.read();
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 3);
    assert.equal(read4.done, true);
    assert.not.ok(read4.value);
    assert.equal(connectionCount, 4);
    // Just report "done"
    const read5 = await reader.read();
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 3);
    assert.equal(read5.done, true);
    assert.not.ok(read5.value);
    // And do not reconnect
    assert.equal(connectionCount, 4);
    connection.close();
    assert.equal(openEvents.size, 3);
    assert.equal(closeEvents.size, 3);
  });
});

test.run();
