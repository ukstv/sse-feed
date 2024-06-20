import { TypedEvent, TypedEventTarget } from "./typed-event-target.js";

export type ConnectionEvents = {
  open: OpenEvent;
  connecting: ConnectingEvent;
  close: CloseEvent;
};

export class CloseEvent extends TypedEvent<"close"> {
  readonly cause: Error | undefined;
  constructor(cause?: Error) {
    super("close");
    this.cause = cause;
  }
}

export class ConnectingEvent extends TypedEvent<"connecting"> {
  constructor() {
    super("connecting");
  }
}

export class OpenEvent extends TypedEvent<"open"> {
  constructor() {
    super("open");
  }
}

function readOrWait(
  controller: ReadableStreamDefaultController<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array> | { done: false; value: null }> {
  if (controller.desiredSize && controller.desiredSize > 0) {
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

export class Connection {
  readonly #url: URL;
  readonly #abortController: AbortController;
  readonly #init: RequestInit;
  readonly #fetch: typeof fetch;
  readonly #events: TypedEventTarget<ConnectionEvents>;

  // Apparently, controller.close is not idempotent
  // Calling controller.close twice in a row leads to an error
  // So we only call it if it has not been called previously
  #isControllerClosed: boolean;

  constructor(url: URL, init: RequestInit, fetchFn: typeof fetch = fetch) {
    this.#url = url;
    this.#init = init;
    this.#fetch = fetchFn;
    this.#abortController = new AbortController();
    this.#isControllerClosed = false;
    this.#events = new TypedEventTarget<ConnectionEvents>();
  }

  get events() {
    return this.#events;
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
      this.#events.dispatchEvent(new ConnectingEvent());
      let response: Response;
      const connectionAbort = new AbortController();
      try {
        const signal = mergeAbortSignals(connectionAbort.signal, this.#abortController.signal);
        response = await this.#fetch(this.#url, { ...this.#init, signal: signal });
      } catch (e) {
        this.#events.dispatchEvent(new CloseEvent(e as Error));
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
        this.#events.dispatchEvent(new CloseEvent(error));
        continue;
      }
      const reader = body.getReader();
      this.#events.dispatchEvent(new OpenEvent());
      try {
        let shallRead = true;
        while (!this.isAborted && shallRead) {
          const next = await readOrWait(controller, reader);
          if (next.value) controller.enqueue(next.value);
          if (next.done) shallRead = false;
        }
      } catch (e) {
        connectionAbort.abort(e);
        this.#events.dispatchEvent(new CloseEvent(e as Error));
        continue;
      }
      this.#events.dispatchEvent(new CloseEvent());
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
