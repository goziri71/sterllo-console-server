import { register, login, logout, changePassword, getProfile } from "../../controllers/auth.js";
import { authenticate } from "../../middleware/auth.js";

export default async function authRoutes(fastify) {
  // Public routes
  fastify.post(
    "/register",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "15 minutes" },
      },
    },
    register,
  );
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "15 minutes" },
      },
    },
    login,
  );

  // Protected routes (require valid JWT)
  fastify.post(
    "/logout",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 120, timeWindow: "15 minutes" },
      },
    },
    logout,
  );
  fastify.get("/profile", { preHandler: authenticate }, getProfile);
  fastify.patch(
    "/change-password",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 40, timeWindow: "15 minutes" },
      },
    },
    changePassword,
  );
}
