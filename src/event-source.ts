import { TypedEvent, TypedEventTarget } from "./typed-event-target.js";
import { ConnectingEvent, Connection, ConnectionEvents, OpenEvent, CloseEvent } from "./connection.js";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { SSEChunkTransformer } from "./sse-chunks-transformer.js";
import { ServerSentEvent } from "./server-sent-event.type.js";

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
  readonly error: Error;
  constructor(error: Error) {
    super("error");
    this.error = error;
  }
}

export type EventSourceEvents = ConnectionEvents & {
  error: ErrorEvent;
};

export class EventSource extends TypedEventTarget<EventSourceEvents> implements ReadableStream<ServerSentEvent> {
  readonly #url: URL;
  readonly #connection: Connection;
  readonly #stream: ReadableStream<ServerSentEvent>;

  #readyState: ReadyState;

  readonly cancel: ReadableStream<ServerSentEvent>["cancel"];
  readonly getReader: ReadableStream<ServerSentEvent>["getReader"];
  readonly pipeThrough: ReadableStream<ServerSentEvent>["pipeThrough"];
  readonly pipeTo: ReadableStream<ServerSentEvent>["pipeTo"];
  readonly tee: ReadableStream<ServerSentEvent>["tee"];

  constructor(endpoint: string | URL, opts: ConnectionOpts = {}, fetchFn: typeof fetch = fetch) {
    super();
    this.#url = new URL(endpoint, globalThis.origin);
    this.#readyState = ReadyState.CONNECTING;
    this.handleOpenEvent = this.handleOpenEvent.bind(this);
    this.handleCloseEvent = this.handleCloseEvent.bind(this);
    this.handleConnectingEvent = this.handleConnectingEvent.bind(this);

    this.#connection = new Connection(this.#url, fetchOptions(opts), fetchFn);
    this.#connection.events.addEventListener("open", function () {
      console.log("Connection opened", this);
    });
    this.#connection.events.addEventListener("connecting", this.handleConnectingEvent);
    this.#connection.events.addEventListener("close", this.handleCloseEvent);
    this.#stream = this.#connection
      .stream()
      .pipeThrough(BytesToStringTransformer.stream())
      .pipeThrough(SSEChunkTransformer.stream());
    this.cancel = this.#stream.cancel.bind(this.#stream);
    this.getReader = this.#stream.getReader.bind(this.#stream);
    this.pipeThrough = this.#stream.pipeThrough.bind(this.#stream);
    this.pipeTo = this.#stream.pipeTo.bind(this.#stream);
    this.tee = this.#stream.tee.bind(this.#stream);
  }

  get locked(): boolean {
    return this.#stream.locked;
  }

  get url(): string {
    return this.#url.href;
  }

  get readyState(): ReadyState {
    return this.#readyState;
  }

  private handleCloseEvent(evt: CloseEvent): void {
    if (evt.cause) {
      this.#readyState = ReadyState.CONNECTING;
      this.dispatchEvent(new ErrorEvent(evt.cause));
    } else {
      this.#readyState = ReadyState.CLOSED;
    }
  }

  private handleConnectingEvent(evt: ConnectingEvent): void {
    this.#readyState = ReadyState.CONNECTING;
  }

  private handleOpenEvent(evt: OpenEvent): void {
    console.trace("open");
    console.log("this.open", this);
    this.#readyState = ReadyState.OPEN;
    this.dispatchEvent(evt);
  }

  close() {
    this.#connection.close();
    this.#connection.events.removeEventListener("open", this.handleOpenEvent);
    this.#connection.events.removeEventListener("connecting", this.handleConnectingEvent);
    this.#connection.events.removeEventListener("close", this.handleCloseEvent);
    this.#readyState = ReadyState.CLOSED;
  }
}
