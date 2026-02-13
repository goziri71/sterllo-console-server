import { register, login, changePassword, getProfile } from "../../controllers/auth.js";
import { authenticate } from "../../middleware/auth.js";

export default async function authRoutes(fastify) {
  // Public routes
  fastify.post("/register", register);
  fastify.post("/login", login);

  // Protected routes (require valid JWT)
  fastify.get("/profile", { preHandler: authenticate }, getProfile);
  fastify.patch("/change-password", { preHandler: authenticate }, changePassword);
}
