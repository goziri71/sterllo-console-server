import {
  getAllDisputes,
  getDispute,
  getDisputesSummary,
  updateDispute,
} from "../../controllers/disputes.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function disputeRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDisputesSummary);
  fastify.get("/", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getAllDisputes);
  fastify.get("/:dispute_reference", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDispute);
  fastify.patch("/:dispute_reference", { preHandler: requirePermission(PERMISSIONS.DISPUTE_UPDATE) }, updateDispute);
}
