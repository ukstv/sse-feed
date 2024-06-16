import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono, type Handler } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { cors } from "hono/cors";
import { Connection, ReadyState } from "./connection.js";
import { once } from "./typed-event-target.js";

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

// TEST: get stream
// TEST: redirect 301, redirect 307
// TEST: no reconnect on 204 no content
// TEST: follow redirects
// TEST: reconnect if connection is closed

test.run();
