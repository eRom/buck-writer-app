export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}
