import { test } from "uvu";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { FauxServer } from "./__tests__/faux-server.js";
import { Connection } from "./connection.js";

test("establish connection", async () => {
  let id = 0;
  const app = new Hono().get("/feed", (c) => {
    return streamSSE(c, async (stream) => {
      let n = 0;
      while (n < 3) {
        const message = `It is ${new Date().toISOString()}`;
        await stream.writeSSE({
          data: message,
          event: "time-update",
          id: String(id++),
        });
      }
    });
  });
  const server = await FauxServer.listen(app, 3000);
  const endpoint = new URL("/feed", server.url);
  const connection = new Connection(endpoint);
  await server.close();
});

test.run();
