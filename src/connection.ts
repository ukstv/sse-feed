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
  #shallReconnect: boolean;

  constructor(
    readonly url: URL,
    readonly init: RequestInit,
  ) {
    super();
    this.#shallReconnect = true;
  }

  stream(): ReadableStream<Uint8Array> {
    return new ReadableStream(this);
  }

  async start(controller: ReadableStreamDefaultController<Uint8Array>) {
    while (this.#shallReconnect) {
      const abortController = new AbortController();
      let response: Response;
      try {
        response = await fetch(this.url, { ...this.init, signal: abortController.signal });
      } catch (e) {
        this.dispatchEvent(new ErrorEvent(e as Error));
        continue;
      }
      const body = response.body as unknown as null | AsyncIterable<Uint8Array>;
      if (body) {
        try {
          for await (const r of body) {
            controller.enqueue(r);
          }
        } catch (e) {
          abortController.abort(e);
          this.dispatchEvent(new ErrorEvent(e as Error));
        }
      }
    }
  }

  async cancel(reason: Error) {
    this.#shallReconnect = false;
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
