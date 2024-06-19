import { test } from "uvu";
import * as assert from "uvu/assert";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";
import { FauxTransformController } from "./__tests__/faux-controllers.js";
import { ServerSentEvent } from "./server-sent-event.type.js";

/// event: time-update
/// data: It is 2024-06-14T13:58:27.510Z
/// id: 34912

// test("wip comment", async () => {
//   const input = ": test stream\n";
//   let actual;
//   const controller = new FauxTransformController({
//     enqueue: (event) => {
//       actual = event;
//     },
//   });
//   transformer.transform(input, controller);
//   console.log("actual: ", actual);
// });

// test("wip data", async () => {
// TODO Event ID
//   const input = "data: hello\n";
//   let actual;
//   const controller = new FauxTransformController({
//     enqueue: (event) => {
//       actual = event;
//     },
//   });
//   transformer.transform(input, controller);
//   console.log("actual: ", actual);
// });

async function receiveSingle(eventStream: string): Promise<ServerSentEvent> {
  const transformer = new SSEChunkTransformer();
  return new Promise<ServerSentEvent>((resolve) => {
    const controller = new FauxTransformController<ServerSentEvent>({
      enqueue: (event) => {
        if (event) {
          resolve(event);
        }
      },
    });
    transformer.transform(eventStream, controller);
  });
}

async function receiveEvents(eventStream: string): Promise<[Array<ServerSentEvent>, SSEChunkTransformer]> {
  const transformer = new SSEChunkTransformer();
  const accumulator: Array<ServerSentEvent> = [];
  return new Promise<[Array<ServerSentEvent>, SSEChunkTransformer]>((resolve) => {
    const controller = new FauxTransformController<ServerSentEvent>({
      enqueue: (event) => {
        if (event) {
          accumulator.push(event);
        }
      },
    });
    transformer.transform(eventStream, controller);
    resolve([accumulator, transformer]);
  });
}

test("single simple event", async () => {
  const eventStream = `data: YHOO
data: +2
data: 10

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 1);
  assert.equal(received[0].data, "YHOO\n+2\n10");
});

test("three data events", async () => {
  const eventStream = `data: This is the first message.

data: This is the second message, it
data: has two lines.

data: This is the third message.

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 3);
  assert.equal(received[0].data, "This is the first message.");
  assert.equal(received[0].type, "message");
  assert.equal(received[1].data, "This is the second message, it\nhas two lines.");
  assert.equal(received[1].type, "message");
  assert.equal(received[2].data, "This is the third message.");
  assert.equal(received[2].type, "message");
});

test("custom event types", async () => {
  const eventStream = `event: add
data: 73857293

event: remove
data: 2153

event: add
data: 113411

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 3);
  assert.equal(received[0].type, "add");
  assert.equal(received[0].data, "73857293");
  assert.equal(received[1].type, "remove");
  assert.equal(received[1].data, "2153");
  assert.equal(received[2].type, "add");
  assert.equal(received[2].data, "113411");
});

test("with comment", async () => {
  const eventStream = `: test stream

data: first event
id: 1

data:second event
id

data:  third event

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 3);
  assert.equal(received[0].type, "message");
  assert.equal(received[0].data, "first event");
  assert.equal(received[0].lastEventId, "1");
  assert.equal(received[1].type, "message");
  assert.equal(received[1].data, "second event");
  assert.equal(received[1].lastEventId, "");
  assert.equal(received[2].type, "message");
  assert.equal(received[2].data, " third event"); // Leading space!
  assert.equal(received[2].lastEventId, "");
});

test("three events no trailing newline", async () => {
  const eventStream = `data

data
data

data:

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 3);
  assert.equal(received[0], {
    type: "message",
    data: "",
    lastEventId: "",
  });
  assert.equal(received[1], {
    type: "message",
    data: "\n",
    lastEventId: "",
  });
  assert.equal(received[2], {
    type: "message",
    data: "",
    lastEventId: "",
  });

});

test("two identical events", async () => {
  const eventStream = `data:test

data: test

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 2);
  assert.equal(received[0], {
    type: "message",
    data: "test",
    lastEventId: "",
  });
  assert.equal(received[1], {
    type: "message",
    data: "test",
    lastEventId: "",
  });
});

test("data contains colon", async () => {
  const eventStream = `data: It is 2024-06-16T09:13Z

data

`;
  const [received] = await receiveEvents(eventStream);
  assert.equal(received.length, 2);
  assert.equal(received[0], {
    type: "message",
    data: "It is 2024-06-16T09:13Z",
    lastEventId: "",
  });
  assert.equal(received[1], {
    type: "message",
    data: "",
    lastEventId: "",
  });
});

test("retry", async () => {
  const eventStream = `data: test
retry: 30

`;
  const [received, transformer] = await receiveEvents(eventStream);
  assert.equal(received.length, 1);
  assert.equal(received[0], {
    type: "message",
    data: "test",
    lastEventId: "",
  });
  assert.equal(transformer.retry, 30);
});

test("retry: non-decimal", async () => {
  const eventStream = `data: test
retry: 10FF

`;
  const [received, transformer] = await receiveEvents(eventStream);
  assert.equal(received.length, 1);
  assert.equal(received[0], {
    type: "message",
    data: "test",
    lastEventId: "",
  });
  assert.equal(transformer.retry, undefined);
});

test("non-standard field", async () => {
  const eventStream = `data: test
custom: field

`;
  const [received, transformer] = await receiveEvents(eventStream);
  assert.equal(received.length, 1);
  assert.equal(received[0], {
    type: "message",
    data: "test",
    lastEventId: "",
  });
});

test.run();
