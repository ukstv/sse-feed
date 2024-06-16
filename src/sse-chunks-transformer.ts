import type { ServerSentEvent } from "./server-sent-event.type.js";

const LINE_END_REGEXP = new RegExp(/(\r\n)|((?!\r)\n)|(\r(?!\n))/);
const ANY_CHAR_REGEXP = new RegExp(/[\u0000-\u0009]|[\u000B-\u000C]|[\u000E-\u{10FFFF}]/u);
const FIELD_VALUE_REGEXP = new RegExp(
  `^(${ANY_CHAR_REGEXP.source}*):\\s?((${ANY_CHAR_REGEXP.source})*)$`,
  ANY_CHAR_REGEXP.flags,
);

const BOM = [239, 187, 191];
function stripBOM(input: string) {
  const hasBOM = BOM.every((charCode: number, index: number) => input.charCodeAt(index) === charCode);
  if (hasBOM) {
    return input.slice(0, BOM.length);
  } else {
    return input;
  }
}

export class SSEChunkTransformer implements Transformer<string, ServerSentEvent> {
  #buffer: string;
  // TODO Maybe use callback
  #retry: number | undefined;

  constructor() {
    this.#buffer = "";
    this.#retry = undefined;
  }

  get retry(): number | undefined {
    return this.#retry;
  }

  transform(chunk: string, controller: TransformStreamDefaultController<ServerSentEvent>): void {
    if (this.#buffer) {
      this.#buffer = this.#buffer + chunk;
    } else {
      this.#buffer = stripBOM(chunk);
    }
    this.processLines(controller);
  }

  processLines(
    controller: TransformStreamDefaultController<ServerSentEvent>,
    accumulator: Partial<ServerSentEvent> = {},
  ): void {
    const [lineFound, fullLineLength] = grabLine(this.#buffer);
    if (lineFound === "") {
      // dispatch the event
      let data = accumulator.data || "";
      if (data.endsWith("\n")) data = data.substring(0, data.length - 1);
      controller.enqueue({
        type: accumulator.type || "message",
        data: data,
        lastEventId: accumulator.lastEventId || "",
      });
      if (fullLineLength > 0) {
        // Has something else to process
        this.#buffer = this.#buffer.substring(fullLineLength);
        return this.processLines(controller);
      } else {
        // Nothing to process yet
        return;
      }
    }
    const indexOfColon = lineFound.indexOf(":");
    if (indexOfColon == 0) {
      // Comment, hence ignore the line
      this.#buffer = this.#buffer.substring(fullLineLength + 1);
      return this.processLines(controller, accumulator);
    }
    if (indexOfColon < 0) {
      // No colon, treat whole line as a field name
      const field = lineFound;
      const value = "";
      const nextAccumulator = this.processField(field, value, accumulator);
      this.#buffer = this.#buffer.substring(fullLineLength);
      return this.processLines(controller, nextAccumulator);
    }
    if (indexOfColon > 0) {
      // Field and value
      const field = lineFound.substring(0, indexOfColon);
      let value = lineFound.substring(indexOfColon + 1);
      if (value.startsWith("\u0020")) {
        // If value starts with a U+0020 SPACE character, remove it from value.
        value = value.substring(1);
      }
      const nextAccumulator = this.processField(field, value, accumulator);
      this.#buffer = this.#buffer.substring(fullLineLength);
      return this.processLines(controller, nextAccumulator);
    }

    // if (lineFound.startsWith(":")) {
    //   // Comment, hence ignore the line
    //   this.#buffer = this.#buffer.substring(fullLineLength + 1);
    //   return this.processLines(controller, accumulator);
    // }
    //
    // const fieldMatch = FIELD_VALUE_REGEXP.exec(lineFound);
    // if (fieldMatch) {
    //   const field = fieldMatch[1];
    //   const value = fieldMatch[2];
    //   const nextAccumulator = this.processField(field, value, accumulator);
    //   this.#buffer = this.#buffer.slice(fullLineLength);
    //   return this.processLines(controller, nextAccumulator);
    // } else {
    //   const field = lineFound;
    //   const value = "";
    //   const nextAccumulator = this.processField(field, value, accumulator);
    //   this.#buffer = this.#buffer.slice(fullLineLength);
    //   return this.processLines(controller, nextAccumulator);
    // }
  }

  processField(field: string, value: string, accumulator: Partial<ServerSentEvent>): Partial<ServerSentEvent> {
    switch (field) {
      case "event": {
        // Set the event type buffer to field value.
        return {
          ...accumulator,
          type: value,
        };
      }
      case "data": {
        // Append the field value to the data buffer, then append a single U+000A LINE FEED (LF) character to the data buffer.
        const currentData = accumulator.data || "";
        const nextData = currentData + value + "\n";
        return {
          ...accumulator,
          data: nextData,
        };
      }
      case "id": {
        // If the field value does not contain U+0000 NULL, then set the last event ID buffer to the field value. Otherwise, ignore the field.
        return {
          ...accumulator,
          lastEventId: value,
        };
      }
      case "retry": {
        // If the field value consists of only ASCII digits, then interpret the field value as an integer in base ten, and set the event stream's reconnection time to that integer. Otherwise, ignore the field.
        const decimal = parseInt(value, 10);
        if (decimal.toString() === value) {
          // valid decimal
          this.#retry = decimal;
          return accumulator;
        } else {
          // ignore non-decimal
          return accumulator;
        }
      }
      default: {
        // The field is ignored.
        return accumulator;
      }
    }
  }
}

function grabLine(input: string): [string, number] {
  const lineRegexp = LINE_END_REGEXP.exec(input);
  if (lineRegexp) {
    const lineFound = input.substring(0, lineRegexp.index);
    const fullLineLength = lineFound.length + lineRegexp[0].length;
    return [lineFound, fullLineLength];
  } else {
    return ["", 0];
  }
}
