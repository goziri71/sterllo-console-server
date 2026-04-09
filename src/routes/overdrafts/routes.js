import { getAllOverdrafts, getOverdraft, updateOverdraft } from "../../controllers/overdrafts.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function overdraftRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getAllOverdrafts);
  fastify.get("/:reference", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getOverdraft);
  fastify.patch("/:reference", { preHandler: requirePermission(PERMISSIONS.OVERDRAFT_UPDATE) }, updateOverdraft);
}
