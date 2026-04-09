import {
  getSettlementSummary,
  getSettlementBatches,
  getSettlementBatch,
} from "../../controllers/settlements.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function settlementRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getSettlementSummary);
  fastify.get("/batches", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getSettlementBatches);
  fastify.get("/batches/:batch_id", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getSettlementBatch);
}
