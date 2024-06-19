import { TypedEventTarget } from "./typed-event-target.js";
import { ConnectionEvents } from "./connection.js";

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

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

export class EventSource extends TypedEventTarget<ConnectionEvents> {
  readonly #url: URL;
  readonly #readyState: ReadyState;

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}) {
    super();
    this.#url = new URL(endpoint, globalThis.origin);
    this.#readyState = ReadyState.CONNECTING;
  }

  get url(): string {
    return this.#url.href;
  }
}
