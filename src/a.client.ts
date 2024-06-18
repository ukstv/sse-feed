// const response = await fetch('http://localhost:3000/feed');
// const body = response.body
// if (body) {
//   for await (const r of body) {
//     console.log(r);
//   }
// }

import { Connection } from "./connection.js";

const c = new Connection(new URL("http://localhost:3000/feed"), { method: "GET" });
const writableConsole = new WritableStream<Uint8Array>({
  async write(chunk: Uint8Array) {
    const textDecoder = new TextDecoder();
    const string = textDecoder.decode(chunk);
    console.log(string);
  },
});
await c.stream().pipeTo(writableConsole)
