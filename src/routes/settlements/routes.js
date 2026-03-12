import {
  getSettlementSummary,
  getSettlementBatches,
  getSettlementBatch,
} from "../../controllers/settlements.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function settlementRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: authorize(...ALL_ROLES) }, getSettlementSummary);
  fastify.get("/batches", { preHandler: authorize(...ALL_ROLES) }, getSettlementBatches);
  fastify.get("/batches/:batch_id", { preHandler: authorize(...ALL_ROLES) }, getSettlementBatch);
}
