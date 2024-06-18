import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";

const app = new Hono().get("/feed", (c) => {
  return streamSSE(c, async (stream) => {
    console.log("open");
    let shouldContinue = true;
    stream.onAbort(() => {
      shouldContinue = false;
    });
    let id = 1;
    while (id < 3 && shouldContinue) {
      const message = `It is ${new Date().toISOString()}`;
      const event = {
        data: message,
        event: "time-update",
        id: String(id++),
      };
      console.log("send", event);
      await stream.writeSSE(event);
    }
    console.log("close");
  });
});

serve({
  fetch: app.fetch,
  port: 3000,
});
