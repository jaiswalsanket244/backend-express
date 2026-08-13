/**
 * An error that carries an HTTP status code. The service layer throws these so
 * that thin route handlers can translate them into a JSON `{ error }` response
 * with the correct status.
 */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
