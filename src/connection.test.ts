import { test } from "uvu";
import * as assert from "uvu/assert";
import { Hono, type Handler } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { cors } from "hono/cors";
import { Connection, ReadyState } from "./connection.js";
import { once } from "./typed-event-target.js";

function makeServer(path: string, handler: Handler, port?: number): Promise<FauxServer> {
  const app = new Hono().use("*", cors({ origin: "*" })).get(path, handler);
  return FauxServer.listen(app, 3000);
}

test("establish connection", async () => {
  const server = await makeServer("/feed", (c) => {
    return streamSSE(c, async (stream) => {
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
    });
  });
  const endpoint = new URL("/feed", server.url);
  const connection = new Connection(endpoint);
  assert.equal(connection.readyState, ReadyState.CONNECTING);
  await once(connection, "open");
  assert.equal(connection.readyState, ReadyState.OPEN);
  connection.close();
  assert.equal(connection.readyState, ReadyState.CLOSED);
  await server.close();
});

test.run();
