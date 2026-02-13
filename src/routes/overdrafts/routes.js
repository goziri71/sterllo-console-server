import { getAllOverdrafts, getOverdraft, updateOverdraft } from "../../controllers/overdrafts.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, OVERDRAFT_UPDATE_ROLES } from "../../config/roles.js";

export default async function overdraftRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllOverdrafts);
  fastify.get("/:reference", { preHandler: authorize(...ALL_ROLES) }, getOverdraft);
  fastify.patch("/:reference", { preHandler: authorize(...OVERDRAFT_UPDATE_ROLES) }, updateOverdraft);
}
