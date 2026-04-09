import { getWalletPage } from "../../controllers/wallets.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function walletsRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/page", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getWalletPage);
}
