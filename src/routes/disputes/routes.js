import {
  getAllDisputes,
  getDispute,
  getDisputesSummary,
  updateDispute,
} from "../../controllers/disputes.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, DISPUTE_UPDATE_ROLES } from "../../config/roles.js";

export default async function disputeRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: authorize(...ALL_ROLES) }, getDisputesSummary);
  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllDisputes);
  fastify.get("/:dispute_reference", { preHandler: authorize(...ALL_ROLES) }, getDispute);
  fastify.patch("/:dispute_reference", { preHandler: authorize(...DISPUTE_UPDATE_ROLES) }, updateDispute);
}
