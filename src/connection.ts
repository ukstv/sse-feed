import { TypedEvent, TypedEventTarget } from "./typed-event-target.js";

export type ConnectionOpts = Partial<RequestInit> & Partial<{ withCredentials: boolean }>;

const DEFAULT_FETCH_OPTIONS = {
  redirect: "follow",
  method: "GET",
  cache: "no-store",
  headers: {
    Accept: "text/event-stream",
  },
} satisfies RequestInit;

function fetchOptions(opts: ConnectionOpts): RequestInit {
  const { withCredentials, ...options } = opts;
  if (withCredentials) {
    return {
      mode: "cors",
      credentials: "include",
      ...DEFAULT_FETCH_OPTIONS,
      ...options,
    };
  } else {
    return {
      mode: "cors",
      credentials: "same-origin",
      ...DEFAULT_FETCH_OPTIONS,
      ...options,
    };
  }
}

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

export type ConnectionEvents = {
  open: OpenEvent;
  error: ErrorEvent;
};

class OpenEvent extends TypedEvent<"open"> {
  constructor() {
    super("open");
  }
}

class ErrorEvent extends TypedEvent<"error"> {
  readonly error: Error;
  constructor(error: Error) {
    super("error");
    this.error = error;
  }
}

type F = UnderlyingSource<Uint8Array>;

export class Connection extends TypedEventTarget<ConnectionEvents> {
  #abortController: AbortController;

  constructor(
    readonly url: URL,
    readonly init: RequestInit,
  ) {
    super();
    this.#abortController = new AbortController();
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream(this);
  }

  get isAborted(): boolean {
    return this.#abortController.signal.aborted;
  }

  async start(controller: ReadableStreamDefaultController<Uint8Array>) {
    while (!this.isAborted) {
      let response: Response;
      const connectionAbort = new AbortController();
      try {
        const signal = AbortSignal.any([connectionAbort.signal, this.#abortController.signal]);
        response = await fetch(this.url, { ...this.init, signal: signal });
      } catch (e) {
        this.dispatchEvent(new ErrorEvent(e as Error));
        continue;
      }
      const body = response.body;
      if (!body) {
        const error = new Error(`Empty body received`);
        connectionAbort.abort(error);
        this.dispatchEvent(new ErrorEvent(error));
        continue;
      }
      const reader = body.getReader();
      try {
        let shallRead = true;
        while (!this.isAborted && shallRead) {
          const next = await reader.read();
          if (next.value) controller.enqueue(next.value);
          if (next.done) shallRead = false;
        }
      } catch (e) {
        this.dispatchEvent(new ErrorEvent(e as Error));
      }
    }
  }

  cancel(reason: Error): void {
    this.#abortController.abort(reason);
  }

  close() {
    this.#abortController.abort("ABORT");
  }
}

export class EventSource extends TypedEventTarget<ConnectionEvents> {
  readonly #url: URL;

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}) {
    super();
    this.#url = new URL(endpoint, globalThis.origin);
  }

  get url(): string {
    return this.#url.href;
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
