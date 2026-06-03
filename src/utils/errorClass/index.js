export class ErrorClass extends Error {
  constructor(message, statusCode, data = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fails" : "error";
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}
