export class ErrorClass extends Error {
  constructor(message, statusCode, data = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fails" : "error";
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

function normalizeUpstreamBody(body) {
  if (body == null) {
    return { state: false, message: "Empty upstream response" };
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return { state: false, message: "Empty upstream response" };
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* plain text body */
    }
    return { state: false, message: trimmed };
  }
  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  return { state: false, message: String(body) };
}

function upstreamBodyMessage(body) {
  const normalized = normalizeUpstreamBody(body);
  if (typeof normalized.message === "string" && normalized.message.trim()) {
    return normalized.message.trim();
  }
  return "Upstream error";
}

/** Return the ISVS response body unchanged (Beamer link/update). */
export class IsvsPassthroughError extends Error {
  constructor(isvsBody, httpStatus) {
    const status = Number(httpStatus);
    super(upstreamBodyMessage(normalizeUpstreamBody(isvsBody)));
    this.statusCode =
      Number.isFinite(status) && status >= 100 && status < 600 ? status : 502;
    this.isvsBody = isvsBody;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** Return the Redbiller proxy JSON body unchanged. */
export class RedbillerPassthroughError extends Error {
  constructor(redbillerBody, httpStatus) {
    const body = normalizeUpstreamBody(redbillerBody);
    super(upstreamBodyMessage(body));
    this.statusCode = httpStatus;
    this.redbillerBody = body;
    Error.captureStackTrace(this, this.constructor);
  }
}
