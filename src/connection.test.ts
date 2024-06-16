import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono, type Handler } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { cors } from "hono/cors";
import { Connection, ReadyState } from "./connection.js";
import { once } from "./typed-event-target.js";

const APP = new Hono()
  .use("*", cors({ origin: "*" }))
  .get("/feed", (c) =>
    streamSSE(c, async (stream) => {
      let id = 0;
      let canContinue = true;
      stream.onAbort(() => {
        canContinue = false;
      });
      while (canContinue) {
        await stream.writeSSE({
          data: `It is ${new Date().toISOString()}`,
          event: "time-update",
          id: String(id++),
        });
      }
    }),
  )
  .get("/reconnect-feed", async (c) =>
    streamSSE(c, async (stream) => {
      let id = 0;
      await stream.writeSSE({
        data: `It is ${new Date().toISOString()}`,
        event: "time-update",
        id: String(id++),
      });
    }),
  );

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

test("redirect 301", async () => {
  console.log("reconnecting...");
  const endpoint = new URL("/feed", server.url);
  console.log("endpoint", endpoint.href);
  const connection = new Connection(endpoint);
  await once(connection, "open");
  console.log("a.0");
  // await new Promise((resolve) => setTimeout(resolve, 100000));
  console.log("a.1");
  connection.close();
});

// TEST: get stream
// TEST: redirect 301, redirect 307
// TEST: no reconnect on 204 no content
// TEST: follow redirects
// TEST: reconnect if connection is closed

test.run();
