import { test } from "uvu";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { testClient } from "hono/testing";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";

// test("hello", async () => {
//   let id = 0;
//   const app = new Hono().get("/feed", (c) => {
//     return streamSSE(c, async (stream) => {
//       let n = 0;
//       while (n < 3) {
//         const message = `It is ${new Date().toISOString()}`;
//         await stream.writeSSE({
//           data: message,
//           event: "time-update",
//           id: String(id++),
//         });
//       }
//     });
//   });
//
//   // const app = new Hono()
//   // let id = 0
//   // app.get('/feed',  (ctx) => {
//   //     return streamSSE(ctx, async (stream) => {
//   //         while (true) {
//   //             const message = `It is ${new Date().toISOString()}`
//   //             await stream.writeSSE({
//   //                 data: message,
//   //                 event: 'time-update',
//   //                 id: String(id++),
//   //             })
//   //             await stream.sleep(1000)
//   //         }
//   //     })
//   // })
//   const client = testClient(app);
//   const res = await client.feed.$get();
//   if (!res.body) {
//     throw new Error("Unable to get feed");
//   }
//   const chunksTransformer = new SSEChunkTransformer();
//   await res.body
//     .pipeThrough(BytesToStringTransformer.stream())
//     .pipeThrough(new TransformStream(chunksTransformer))
//     .pipeTo(
//       new WritableStream({
//         write(data) {
//           console.log(data);
//         },
//       }),
//     );
//
//   // const res = await testClient(app).search.$get()
//
//   // expect(await res.json()).toEqual({ hello: 'world' })
// });

// test.run();
