export const errorHandler = (error, request, reply) => {
  request.log.error(error);

  const statusCode = Number(error?.statusCode || error?.status || 500);
  const isClientError = statusCode >= 400 && statusCode < 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Only expose detailed messages for expected 4xx errors.
  // Hide internal details (e.g. raw SQL/driver errors) behind a safe message.
  const message = isClientError
    ? (error.message || "Bad request")
    : "An unexpected error occurred";

  const payload = {
    success: false,
    message,
  };

  if (!isProduction && !isClientError && error?.message) {
    payload.debug = error.message;
  }

  reply.code(statusCode).send(payload);
};
