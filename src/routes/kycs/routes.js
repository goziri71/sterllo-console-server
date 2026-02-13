import { getAllKYCs, getKYC, updateKYC } from "../../controllers/kycs.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, KYC_UPDATE_ROLES } from "../../config/roles.js";

export default async function kycRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  // Read routes (all roles)
  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllKYCs);
  fastify.get("/:reference", { preHandler: authorize(...ALL_ROLES) }, getKYC);

  // Update routes (compliance only)
  fastify.patch("/:reference", { preHandler: authorize(...KYC_UPDATE_ROLES) }, updateKYC);
}
