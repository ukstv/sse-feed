import { TypedEvent, TypedEventTarget } from "./typed-event-target.js";
import { ConnectingEvent, Connection, OpenEvent, CloseEvent } from "./connection.js";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";
import { ServerSentEvent } from "./server-sent-event.type.js";
import { StreamAlreadyCreatedError } from "./stream-already-created-error.js";

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

export class ErrorEvent extends TypedEvent<"error"> {
  readonly cause?: Error;
  constructor(error?: Error) {
    super("error");
    this.cause = error;
  }
}

export type EventSourceEvents = {
  open: OpenEvent;
  error: ErrorEvent;
};

export class EventSource extends TypedEventTarget<EventSourceEvents> {
  readonly #url: URL;
  readonly #connection: Connection;
  readonly #sseChunkTransformer: SSEChunkTransformer;

  #stream: ReadableStream<ServerSentEvent> | undefined;
  #readyState: ReadyState;

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}, fetchFn: typeof fetch = fetch) {
    super();
    this.#url = new URL(endpoint, globalThis.origin);
    this.#readyState = ReadyState.CONNECTING;
    this.handleOpenEvent = this.handleOpenEvent.bind(this);
    this.handleCloseEvent = this.handleCloseEvent.bind(this);
    this.handleConnectingEvent = this.handleConnectingEvent.bind(this);

    this.#connection = new Connection(this.#url, fetchOptions(opts), fetchFn);
    this.#connection.addEventListener("open", this.handleOpenEvent);
    this.#connection.addEventListener("connecting", this.handleConnectingEvent);
    this.#connection.addEventListener("close", this.handleCloseEvent);
    this.#sseChunkTransformer = new SSEChunkTransformer();
    this.#sseChunkTransformer.addEventListener("setRetry", (evt) => {
      this.#connection.retry = evt.value;
    });
    this.#stream = undefined;
  }

  get connection(): Connection {
    return this.#connection;
  }

  get url(): string {
    return this.#url.href;
  }

  get readyState(): ReadyState {
    return this.#readyState;
  }

  stream(): ReadableStream<ServerSentEvent> {
    if (this.#stream) {
      throw new StreamAlreadyCreatedError(`Connection`);
    } else {
      this.#stream = new ReadableStream(this.#connection)
        .pipeThrough(BytesToStringTransformer.stream())
        .pipeThrough(new TransformStream(this.#sseChunkTransformer));
      return this.#stream;
    }
  }

  private handleCloseEvent(evt: CloseEvent): void {
    if (evt.cause) {
      this.#readyState = ReadyState.CONNECTING;
      this.dispatchEvent(new ErrorEvent(evt.cause));
    } else {
      this.#readyState = ReadyState.CLOSED;
      this.dispatchEvent(new ErrorEvent());
    }
  }

  private handleConnectingEvent(evt: ConnectingEvent): void {
    this.#readyState = ReadyState.CONNECTING;
  }

  private handleOpenEvent(): void {
    this.#readyState = ReadyState.OPEN;
    this.dispatchEvent(new OpenEvent());
  }

  close() {
    this.#connection.close();
    this.#connection.removeEventListener("open", this.handleOpenEvent);
    this.#connection.removeEventListener("connecting", this.handleConnectingEvent);
    this.#connection.removeEventListener("close", this.handleCloseEvent);
    this.#readyState = ReadyState.CLOSED;
  }
}
