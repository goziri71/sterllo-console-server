import { getDefaultFees } from "../../controllers/fees.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function feeRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/defaults", { preHandler: authorize(...ALL_ROLES) }, getDefaultFees);
}
