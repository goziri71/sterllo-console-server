function resolveHttpAndBodyCode(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 100) {
    return { httpStatus: 500, bodyCode: 5000 };
  }
  if (n >= 1000) {
    const httpStatus = Math.min(599, Math.max(100, Math.floor(n / 10)));
    return { httpStatus, bodyCode: n };
  }
  if (n < 600) {
    return { httpStatus: n, bodyCode: n * 10 };
  }
  return { httpStatus: 500, bodyCode: 5000 };
}

export const errorHandler = (error, request, reply) => {
  request.log.error(error);

  const raw =
    error?.statusCode ??
    (typeof error?.status === "number" ? error.status : undefined) ??
    500;
  const { httpStatus, bodyCode } = resolveHttpAndBodyCode(raw);
  const isClientError = httpStatus >= 400 && httpStatus < 500;
  const isProduction = process.env.NODE_ENV === "production";

  const message = isClientError
    ? (error.message || "Bad request")
    : "An unexpected error occurred";

  let data = {};
  if (error?.data && typeof error.data === "object" && !Array.isArray(error.data)) {
    data = error.data;
  } else if (!isProduction && !isClientError && error?.message) {
    data.debug = error.message;
  }

  reply.code(httpStatus).send({
    code: bodyCode,
    state: false,
    message,
    data: Object.keys(data).length > 0 ? data : {},
  });
};
