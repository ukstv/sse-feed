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

// test("establish and close connection", async () => {
//   const endpoint = new URL("/feed", server.url);
//   const connection = new Connection(endpoint);
//   assert.equal(connection.readyState, ReadyState.CONNECTING);
//   await once(connection, "open");
//   assert.equal(connection.readyState, ReadyState.OPEN);
//   connection.close();
//   assert.equal(connection.readyState, ReadyState.CLOSED);
// });

// test("get stream", async () => {
//   let id = 0;
//   const app = new Hono().get("/feed", (c) =>
//     streamSSE(c, async (stream) => {
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
//     }),
//   );
//   const server = await FauxServer.listen(app);
//   const connection = new Connection(new URL("/feed", server.url), {});
//   const stream = connection
//     .stream()
//     .pipeThrough(BytesToStringTransformer.stream())
//     .pipeThrough(SSEChunkTransformer.stream());
//   const reader = stream.getReader();
//   const a = await reader.read();
//   const b = await reader.read();
//   assert.equal(a, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
//   assert.equal(b, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
//   connection.close();
//   await server.close();
// });
//
// test("follow redirect", async () => {
//   let id = 0;
//   const app = new Hono()
//     .get("/feed", (c) =>
//       streamSSE(c, async (stream) => {
//         let canContinue = true;
//         stream.onAbort(() => {
//           canContinue = false;
//         });
//         while (canContinue) {
//           await stream.writeSSE({
//             data: String(id),
//             event: "time-update",
//             id: String(id++),
//           });
//         }
//       }),
//     )
//     .get("/redirect-301-c", (c) => {
//       return c.redirect("/feed", 301);
//     })
//     .get("/redirect-307-b", (c) => {
//       return c.redirect("/redirect-301-c", 307);
//     })
//     .get("/redirect-302-a", (c) => {
//       return c.redirect("/redirect-307-b", 302);
//     });
//   const server = await FauxServer.listen(app);
//   const connection = new Connection(new URL("/redirect-302-a", server.url), {
//     redirect: "follow",
//   });
//   const stream = connection
//     .stream()
//     .pipeThrough(BytesToStringTransformer.stream())
//     .pipeThrough(SSEChunkTransformer.stream());
//   const reader = stream.getReader();
//   const a = await reader.read();
//   const b = await reader.read();
//   assert.equal(a, { done: false, value: { type: "time-update", data: "0", lastEventId: "0" } });
//   assert.equal(b, { done: false, value: { type: "time-update", data: "1", lastEventId: "1" } });
//   connection.close();
//   await server.close();
// });

// test("reconnect if connection is closed by server", async () => {
//   let connectionCount = 0;
//   const app = new Hono().get("/feed", (c) =>
//     streamSSE(c, async (stream) => {
//       connectionCount += 1;
//       await stream.writeSSE({
//         data: Date.toString(),
//         event: "time-update",
//         id: String(connectionCount),
//       });
//       await stream.close();
//     }),
//   );
//   const server = await FauxServer.listen(app);
//   const connection = new Connection(new URL("/feed", server.url), {
//     redirect: "follow",
//   });
//   const stream = connection.stream();
//   const reader = stream.getReader();
//   await reader.read();
//   assert.equal(connectionCount, 1);
//   await reader.read();
//   assert.equal(connectionCount, 2);
//   await reader.read();
//   assert.equal(connectionCount, 3);
//   connection.close();
//   await server.close();
// });

test('no reconnect on 204 no content', async () => {

})

// TEST: no reconnect on 204 no content
// TEST: reconnect if connection is closed

test.run();
