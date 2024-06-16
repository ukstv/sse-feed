import sinon from "sinon";

type EnqueueFn<O> = TransformStreamDefaultController<O>["enqueue"];
type ErrorFn<O> = TransformStreamDefaultController<O>["error"];
type TerminateFn<O> = TransformStreamDefaultController<O>["terminate"];
type SpyOf<F extends (...args: any[]) => any> = sinon.SinonSpy<Parameters<F>, ReturnType<F>>;

type TransformOpts<O> = {
  desiredSize: number;
  enqueue: EnqueueFn<O>;
  error: ErrorFn<O>;
  terminate: TerminateFn<O>;
};

export class FauxTransformController<O> implements TransformStreamDefaultController<O> {
  readonly desiredSize: number | null;
  readonly enqueue: SpyOf<EnqueueFn<O>>;
  readonly error: SpyOf<ErrorFn<O>>;
  readonly terminate: SpyOf<TerminateFn<O>>;

  constructor(opts: Partial<TransformOpts<O>> = {}) {
    this.desiredSize = opts.desiredSize || 1;
    this.enqueue = opts.enqueue ? sinon.fake(opts.enqueue) : sinon.fake();
    this.error = opts.error ? sinon.fake(opts.error) : sinon.fake();
    this.terminate = opts.terminate ? sinon.fake(opts.terminate) : sinon.fake();
  }
}
