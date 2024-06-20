import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export function makeApp(): Hono {
  let id = 0;
  return new Hono().get("/feed", (c) =>
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
}
