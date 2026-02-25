import { getWalletPage } from "../../controllers/wallets.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function walletsRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/page", { preHandler: authorize(...ALL_ROLES) }, getWalletPage);
}
