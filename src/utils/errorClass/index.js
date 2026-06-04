export class ErrorClass extends Error {
  constructor(message, statusCode, data = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fails" : "error";
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Return the ISVS JSON body unchanged (Beamer link/update). */
export class IsvsPassthroughError extends Error {
  constructor(isvsBody, httpStatus) {
    const body =
      isvsBody && typeof isvsBody === "object" && !Array.isArray(isvsBody)
        ? isvsBody
        : { state: false, message: String(isvsBody ?? "") };
    super(typeof body.message === "string" ? body.message : "ISVS error");
    this.statusCode = httpStatus;
    this.isvsBody = body;
    Error.captureStackTrace(this, this.constructor);
  }
}
