export type EventMap = Record<string, Event>;

type EventListenerOrEventListenerObject<K extends keyof E, E extends EventMap> =
  | EventListener<K, E>
  | EventListenerObject<K, E>;

interface EventListener<K extends keyof E, E extends EventMap> {
  (evt: E[K]): void;
}

interface EventListenerObject<K extends keyof E, E extends EventMap> {
  handleEvent(object: E[K]): void;
}

export class TypedEvent<T extends string> extends Event {
  readonly type: T;
  constructor(type: T, eventInitDict?: EventInit) {
    super(type, eventInitDict);
    this.type = type;
  }
}

export class TypedEventTarget<E extends EventMap> extends EventTarget {
  addEventListener<K extends keyof E>(
    type: K,
    callback: EventListenerOrEventListenerObject<K, E> | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    super.addEventListener(type as any, callback as any, options);
  }

  dispatchEvent(event: E[keyof E]): boolean {
    return super.dispatchEvent(event);
  }

  removeEventListener<K extends keyof E>(
    type: K,
    callback: EventListenerOrEventListenerObject<K, E> | null,
    options?: EventListenerOptions | boolean,
  ): void {
    super.removeEventListener(type as any, callback as any, options);
  }
}

export function once<K extends keyof E, E extends EventMap>(target: TypedEventTarget<E>, type: K): Promise<E[K]> {
  return new Promise<E[K]>((resolve) => {
    target.addEventListener(
      type,
      (event) => {
        resolve(event);
      },
      { once: true },
    );
  });
}
