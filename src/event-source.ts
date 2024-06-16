export type EventSourceOpts = {
  withCredentials: boolean;
};

export enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

export class EventSource extends EventTarget {
  readonly #url: string;
  readonly #withCredentials: boolean;
  #readyState: ReadyState;

  static CONNECTING = ReadyState.CONNECTING;
  static OPEN = ReadyState.OPEN;
  static CLOSED = ReadyState.CLOSED;

  constructor(url: string, opts: Partial<EventSourceOpts> = {}) {
    super();
    this.#url = url;
    this.#withCredentials = opts.withCredentials ?? false;
    this.#readyState = ReadyState.CONNECTING;
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
