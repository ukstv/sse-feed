import type { ServerSentEvent } from "./server-sent-event.type.js";
import { createNanoEvents, type Emitter } from "nanoevents";

export type EventSourceOpts = {
  withCredentials: boolean;
};

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

type Events = {
  error: (error: Error) => void;
  message: (message: ServerSentEvent) => void;
  open: () => void;
};

export class EventSource {
  readonly #url: string;
  readonly #withCredentials: boolean;
  readonly #events: Emitter<Events>;
  #readyState: ReadyState;

  static CONNECTING = ReadyState.CONNECTING;
  static OPEN = ReadyState.OPEN;
  static CLOSED = ReadyState.CLOSED;

  constructor(url: string, opts: Partial<EventSourceOpts> = {}) {
    this.#url = url;
    this.#withCredentials = opts.withCredentials ?? false;
    this.#readyState = ReadyState.CONNECTING;
    this.#events = createNanoEvents<Events>();
  }

  get events(): Emitter<Events> {
    return this.#events;
  }

  get url(): string {
    return this.#url;
  }

  get withCredentials(): boolean {
    return this.#withCredentials;
  }

  get readyState(): ReadyState {
    return this.#readyState;
  }

  close() {
    throw new Error(`Not Implemented: close`);
  }
}
