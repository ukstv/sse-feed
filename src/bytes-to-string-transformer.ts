const TEXT_DECODER = new TextDecoder();

export class BytesToStringTransformer implements Transformer<Uint8Array, string> {
  static stream(): TransformStream<Uint8Array, string> {
    const underlying = new BytesToStringTransformer();
    return new TransformStream(underlying);
  }

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<string>): void {
    const string = TEXT_DECODER.decode(chunk);
    controller.enqueue(string);
  }
}
