import { getDefaultFees } from "../../controllers/fees.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function feeRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/defaults", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDefaultFees);
}
