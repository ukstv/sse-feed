import { test } from "uvu";
import * as assert from "uvu/assert";
import { BytesToStringTransformer } from "./bytes-to-string-transformer.js";
import { FauxTransformController } from "./__tests__/faux-controllers.js";

const TEXT_ENCODER = new TextEncoder();

test("decode bytes to string", () => {
  const transformer = new BytesToStringTransformer();
  const string = "Hello, world";
  const bytes = TEXT_ENCODER.encode(string);
  const controller = new FauxTransformController();
  transformer.transform(bytes, controller);
  assert.equal(controller.enqueue.callCount, 1);
  assert.equal(controller.enqueue.args[0], [string]);
});

test.run();
