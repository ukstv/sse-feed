import { createNanoEvents, type Emitter } from "nanoevents";

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

export type ConnectionEvents = {
  open: () => void;
  error: (error: Error) => void;
};

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

export class Connection {
  readonly url: string;
  readonly withCredentials: boolean;

  #readyState: ReadyState;

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}) {
    const url = new URL(endpoint, globalThis.origin);
    this.url = url.href;
    this.withCredentials = opts.withCredentials ?? false;
    this.#readyState = ReadyState.CONNECTING;
  }
}
