# SSE Feed

> Server-Sent Events consumer supporting backpressure.

## Introduction

`EventSource` API to consume SSE feed is not available in Node.js.
There are plenty of polyfills for `EventSource`. There are some consumers of SSE connection.
All of them suffer in some way:
- not handling automatic reconnects,
- or having a weird buffering behaviour,
- or relying on Node-specific http API,
- or not supporting backpressure.

This library tries to solve that. It does reconnect as `EventSource` does, it does not buffer input, it supports backpressure, it connects through a native [fetch](FIXME).

## Installation

As usual, do
```shell
npm add sse-feed
```

## Usage

First, create an instance of `SSEFeed`, then consume the stream as `sseFeed.stream()`. It presents a JS-native [`ReadableStream`]().

```typescript
import { SSEFeed } from 'sse-feed'
const sseFeed = new SSEFeed('http://example.com/sse')
// Use iteration
for await (const event of sseFeed.stream()) {
  // Do something with the event
  console.log(event)
}
// ...or use more native streaming
sseFeed.stream().pipeTo(...)
```

### Cancellation

When you are done with consuming the events, call `sseFeed.close()`. It tells the stream to gracefully stop.

### "open" and "close" events

To keep track of the feed connectivity, you could subscribe to `open` and `error` events. `SSEFeed` implements `EventTarget` interface.
These events are independent of SSE stream events.

```typescript
import { SSEFeed } from 'sse-feed'
const sseFeed = new SSEFeed('http://example.com/sse')
sseFeed.stream().pipeTo(...)
sseFeed.addEventListener('open', openEvent => {
console.log('Opened')
})
```

`open` and `error` events could be emitted multiple times during the streaming as per the Server-Sent Events specification.

### One SSEFeed instance - One stream

Calling `sseFeed.stream()` initiates a HTTP connection. The connection lifecycle is tracked by `open` and `error` events.
Hence, there is a one-to-one correspondence between `ReadableStream` of `sseFeed.stream()` and an instance of `SSEFeed`.
Hence, you can call `sseFeed.stream()` once per `sseFeed` instance.

If you need multiple consumers, you could use `tee()` method, like `sseFeed.steram().tee()`, or you could create another `SSEFeed` instance.

### Custom fetch properties

`SSEFeed` constructor accepts an optional second parameter. It can be `{ withCredentials: true }` like for `EventSource`.
Or it can be fetch parameters like `{ method: 'POST' }`.

## Contributing

Please, feel free to raise issues, ask questions, make PRs and so on.

## License

MIT or Apache-2.0
