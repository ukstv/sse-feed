import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { makeApp } from "./__tests__/make-app.js";
import { eventCounts } from "./__tests__/event-counts.js";
import { EventSource } from "./event-source.js";

test("get stream", () => {
  return FauxServer.with(makeApp(), async (url) => {
    const eventSource = new EventSource(new URL("/feed", url));
    const openEvents = eventCounts(eventSource, "open");
    const errorEvents = eventCounts(eventSource, "error");
    const reader = eventSource.stream().getReader();
    const read1 = await reader.read();
    const read2 = await reader.read();
    assert.equal(read1, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
    assert.equal(read2, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
    eventSource.close();
    assert.equal(openEvents.size, 1);
    assert.equal(errorEvents.size, 0);
  });
});

test("follow redirect", async () => {
  // Redirects: /redirect-302-a --(302)--> /redirect-307-b --(307)--> /redirect-301-c --(301)--> /feed
  const app = makeApp()
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
    const eventSource = new EventSource(new URL("/redirect-302-a", url));
    const openEvents = eventCounts(eventSource, "open");
    const errorEvents = eventCounts(eventSource, "error");
    const reader = eventSource.stream().getReader();
    const read1 = await reader.read();
    const read2 = await reader.read();
    assert.equal(read1, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
    assert.equal(read2, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
    eventSource.close();
    assert.equal(openEvents.size, 1);
    assert.equal(errorEvents.size, 0);
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
    const eventSource = new EventSource(new URL("/feed", url));
    const openEvents = eventCounts(eventSource, "open");
    const errorEvents = eventCounts(eventSource, "error");
    const stream = eventSource.stream();
    const reader = stream.getReader();
    assert.equal(openEvents.size, 0);
    assert.equal(errorEvents.size, 0);
    await reader.read();
    assert.equal(connectionCount, 1);
    assert.equal(openEvents.size, 1);
    assert.equal(errorEvents.size, 0);
    await reader.read();
    assert.equal(connectionCount, 2);
    assert.equal(openEvents.size, 2);
    assert.equal(errorEvents.size, 1);
    await reader.read();
    assert.equal(connectionCount, 3);
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 2);
    eventSource.close();
    assert.equal(connectionCount, 3);
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 2);
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
    const eventSource = new EventSource(new URL("/feed", url));
    const openEvents = eventCounts(eventSource, "open");
    const errorEvents = eventCounts(eventSource, "error");
    const reader = eventSource.stream().getReader();
    // Read MAX_CONNECTIONS_TILL_NO_CONTENT values
    for (let i = 0; i < MAX_CONNECTIONS_TILL_NO_CONTENT; i++) {
      const read = await reader.read();
      assert.equal(read.done, false);
      assert.ok(read.value);
      assert.equal(connectionCount, i + 1);
    }
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 2);
    // And now we get 204 no content
    const read4 = await reader.read();
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 3);
    assert.equal(read4.done, true);
    assert.not.ok(read4.value);
    assert.equal(connectionCount, 4);
    // Just report "done"
    const read5 = await reader.read();
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 3);
    assert.equal(read5.done, true);
    assert.not.ok(read5.value);
    // And do not reconnect
    assert.equal(connectionCount, 4);
    eventSource.close();
    assert.equal(openEvents.size, 3);
    assert.equal(errorEvents.size, 3);
  });
});

// Beware: due to a bug in Hono node-server https://github.com/honojs/node-server/issues/179
// this test fails the whole suite
// test("can connect via POST", async () => {
//   const app = new Hono().post("/feed-post", (c) => {
//     let id = 0;
//     return streamSSE(c, async (stream) => {
//       let canContinue = true;
//       stream.onAbort(() => {
//         canContinue = false;
//       });
//       while (canContinue) {
//         await stream.writeSSE({
//           data: String(id),
//           event: "time-update",
//           id: String(id++),
//         });
//       }
//     });
//   });
//   return FauxServer.with(app, async (url) => {
//     const eventSource = new EventSource(new URL("/feed-post", url), { method: "POST" });
//     const openEvents = eventCounts(eventSource, "open");
//     const errorEvents = eventCounts(eventSource, "error");
//     const reader = eventSource.stream().getReader();
//     const read1 = await reader.read();
//     const read2 = await reader.read();
//     assert.equal(read1, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
//     assert.equal(read2, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
//     eventSource.close();
//     assert.equal(openEvents.size, 1);
//     assert.equal(errorEvents.size, 0);
//   });
// });

test("respects retry", async () => {
  let id = 0;
  const app = new Hono().post("/feed-post", (c) => {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: String(id),
        event: "time-update",
        id: String(id),
        retry: id * 100,
      });
      id += 1;
      await stream.close();
    });
  });
  return FauxServer.with(app, async (url) => {
    const eventSource = new EventSource(new URL("/feed-post", url), { method: "POST" });
    const reader = eventSource.stream().getReader();
    await reader.read();
    assert.equal(eventSource.retry, 0);
    await reader.read();
    assert.equal(eventSource.retry, 100);
    await reader.read();
    assert.equal(eventSource.retry, 200);
    eventSource.close();
  });
});

test("handle last event id", async () => {
  const app = new Hono().post("/feed-post", (c) => {
    const lastEventIdRequested = c.req.header("Last-Event-Id");
    return streamSSE(c, async (stream) => {
      if (lastEventIdRequested) {
        const nextId = parseInt(lastEventIdRequested, 10) + 1;
        await stream.writeSSE({
          data: String(nextId),
          id: String(nextId),
        });
      } else {
        await stream.writeSSE({
          data: "0",
          id: "0",
        });
      }
      await stream.close();
    });
  });
  return FauxServer.with(app, async (url) => {
    const eventSource = new EventSource(new URL("/feed-post", url), { method: "POST" });
    const reader = eventSource.stream().getReader();
    const read1 = await reader.read();
    assert.equal(read1, {
      done: false,
      value: { type: "message", data: "0", lastEventId: "0" },
    });
    const read2 = await reader.read();
    assert.equal(read2, {
      done: false,
      value: { type: "message", data: "1", lastEventId: "1" },
    });
    const read3 = await reader.read();
    assert.equal(read3, {
      done: false,
      value: { type: "message", data: "2", lastEventId: "2" },
    });
    eventSource.close();
  });
});

test.run();
