import { TypedEvent, TypedEventTarget } from "./typed-event-target.js";

export type ConnectionEvents = {
  open: OpenEvent;
  connecting: ConnectingEvent;
  close: CloseEvent;
};

class CloseEvent extends TypedEvent<"close"> {
  readonly cause: Error | undefined;
  constructor(cause?: Error) {
    super("close");
    this.cause = cause;
  }
}

class ConnectingEvent extends TypedEvent<"connecting"> {
  constructor() {
    super("connecting");
  }
}

class OpenEvent extends TypedEvent<"open"> {
  constructor() {
    super("open");
  }
}

function readOrWait(
  controller: ReadableStreamDefaultController<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array> | { done: false; value: null }> {
  if (Boolean(controller.desiredSize)) {
    return reader.read();
  } else {
    return Promise.resolve({ done: false, value: null });
  }
}

function mergeAbortSignals(...signals: Array<AbortSignal>): AbortSignal {
  // Part of baseline API, but TS does not know about it somehow
  // @ts-expect-error
  return AbortSignal.any(signals);
}

export class Connection extends TypedEventTarget<ConnectionEvents> {
  #abortController: AbortController;
  // Apparently, controller.close is not idempotent
  // Calling controller.close twice in a row leads to an error
  // So we only call it if it has not been called previously
  #isControllerClosed: boolean;

  constructor(
    readonly url: URL,
    readonly init: RequestInit,
  ) {
    super();
    this.#abortController = new AbortController();
    this.#isControllerClosed = false;
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream(this);
  }

  private get isAborted(): boolean {
    return this.#abortController.signal.aborted;
  }

  /**
   * @internal Part of UnderlyingSource API
   */
  async start(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.#abortController.signal.addEventListener(
      "abort",
      () => {
        if (!this.#isControllerClosed) {
          controller.close();
          this.#isControllerClosed = true;
        }
      },
      { once: true },
    );
    while (!this.isAborted) {
      this.dispatchEvent(new ConnectingEvent());
      let response: Response;
      const connectionAbort = new AbortController();
      try {
        const signal = mergeAbortSignals(connectionAbort.signal, this.#abortController.signal);
        response = await fetch(this.url, { ...this.init, signal: signal });
      } catch (e) {
        this.dispatchEvent(new CloseEvent(e as Error));
        continue;
      }
      if (response.status === 204) {
        if (!this.#isControllerClosed) {
          controller.close();
          this.#isControllerClosed = true;
        }
        return;
      }
      const body = response.body;
      if (!body) {
        const error = new Error(`Empty body received`);
        connectionAbort.abort(error);
        this.dispatchEvent(new CloseEvent(error));
        continue;
      }
      const reader = body.getReader();
      this.dispatchEvent(new OpenEvent());
      try {
        let shallRead = true;
        while (!this.isAborted && shallRead) {
          const next = await readOrWait(controller, reader);
          if (next.value) controller.enqueue(next.value);
          if (next.done) shallRead = false;
        }
      } catch (e) {
        connectionAbort.abort(e);
        this.dispatchEvent(new CloseEvent(e as Error));
        continue;
      }
      this.dispatchEvent(new CloseEvent());
    }
  }

  /**
   * @internal Part of UnderlyingSource API
   */
  cancel(reason: Error): void {
    this.#abortController.abort(reason);
  }

  close() {
    this.#abortController.abort("ABORT");
  }
}

// export class Connection extends TypedEventTarget<ConnectionEvents> {
//   readonly url: string;
//   readonly withCredentials: boolean;
//
//   #readyState: ReadyState;
//   #responseP: Promise<Response>;
//
//   readonly #abortController: AbortController;
//
//   constructor(endpoint: string | URL, opts: ConnectionOpts = {}) {
//     super();
//     const url = new URL(endpoint, globalThis.origin);
//     this.url = url.href;
//     this.withCredentials = opts.withCredentials ?? false;
//     this.#readyState = ReadyState.CONNECTING;
//     this.#abortController = new AbortController();
//     this.#responseP = fetch(this.url, fetchOptions({ ...opts, signal: this.#abortController.signal }))
//       .then((response) => {
//         this.#readyState = ReadyState.OPEN;
//         this.dispatchEvent(new OpenEvent());
//         // return response.body;
//         return response;
//       })
//       .catch((e) => {
//         console.log("catch.1", e);
//         this.#readyState = ReadyState.CLOSED;
//         this.dispatchEvent(new ErrorEvent(e));
//         throw e;
//       });
//   }
//
//   get readyState(): ReadyState {
//     return this.#readyState;
//   }
//
//   close() {
//     this.#readyState = ReadyState.CLOSED;
//     this.#abortController.abort();
//   }
// }
