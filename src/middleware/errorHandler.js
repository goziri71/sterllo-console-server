export const errorHandler = (error, request, reply) => {
  request.log.error(error);

  reply.code(error.statusCode || 500).send({
    success: false,
    message: error.message || "Server error",
  });
};
