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

export class Connection extends TypedEventTarget<ConnectionEvents> {
  readonly url: string;
  readonly withCredentials: boolean;

  #readyState: ReadyState;
  #responseP: Promise<Response>;

  readonly #abortController: AbortController;

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}) {
    super();
    const url = new URL(endpoint, globalThis.origin);
    this.url = url.href;
    this.withCredentials = opts.withCredentials ?? false;
    this.#readyState = ReadyState.CONNECTING;
    this.#abortController = new AbortController();
    this.#responseP = fetch(this.url, fetchOptions({ ...opts, signal: this.#abortController.signal }));
    this.#responseP
      .then((response) => {
        this.#readyState = ReadyState.OPEN;
        this.dispatchEvent(new OpenEvent());
        // this.#abortController.abort();
      })
      .catch((e) => {
        console.log("catch.1", e);
        this.#readyState = ReadyState.CLOSED;
        this.dispatchEvent(new ErrorEvent(e));
      });
  }

  get readyState(): ReadyState {
    return this.#readyState;
  }

  close() {
    this.#readyState = ReadyState.CLOSED;
    this.#abortController.abort();
  }
}
