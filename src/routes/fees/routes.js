import {
  getDefaultFees,
  createDefaultFee,
  updateDefaultFee,
  deleteDefaultFee,
  listPricingAudit,
} from "../../controllers/fees.js";
import {
  authenticate,
  requirePermission,
  requireRecentMfa,
} from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function feeRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);
  const readGuard = requirePermission(PERMISSIONS.PRICING_READ);
  const writeGuard = [requirePermission(PERMISSIONS.PRICING_MANAGE), requireRecentMfa];

  fastify.get("/defaults", { preHandler: readGuard }, getDefaultFees);
  fastify.get("/audit", { preHandler: readGuard }, listPricingAudit);
  fastify.post("/defaults/:feeType", { preHandler: writeGuard }, createDefaultFee);
  fastify.patch("/defaults/:feeType/:id", { preHandler: writeGuard }, updateDefaultFee);
  fastify.delete("/defaults/:feeType/:id", { preHandler: writeGuard }, deleteDefaultFee);
}
