export class StreamAlreadyCreatedError extends Error {
  constructor(name: string) {
    super(`Stream of ${name} already created`);
  }
}
