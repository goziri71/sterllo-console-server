import { getAllKYCs, getKYC, updateKYC } from "../../controllers/kycs.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function kycRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getAllKYCs);
  fastify.get("/:reference", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getKYC);

  fastify.patch("/:reference", { preHandler: requirePermission(PERMISSIONS.KYC_UPDATE) }, updateKYC);
}
