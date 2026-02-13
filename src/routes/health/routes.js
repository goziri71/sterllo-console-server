export default async function healthRoutes(fastify) {
  fastify.get("/", async (request, reply) => {
    return reply.code(200).send({
      status: 2000,
      success: true,
      service: "Sterllo wallet console API",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      message: "Service is running",
      version: "1.0.0",
    });
  });
}