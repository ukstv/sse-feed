import type { EventMap, TypedEventTarget } from "../typed-event-target.js";

export function eventCounts<EV extends EventMap>(target: TypedEventTarget<EV>, kind: keyof EV) {
  let events: Array<keyof EV> = [];
  target.addEventListener(kind, (event) => {
    events.push(event as any);
  });
  return {
    get size(): number {
      return events.length;
    },
  };
}
