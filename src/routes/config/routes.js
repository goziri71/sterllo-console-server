import { getCurrencies, getVATs, getCustomerTiers, getWhitelistedIPs } from "../../controllers/config.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, ROLES } from "../../config/roles.js";

export default async function configRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  // Read-only config routes (all roles)
  fastify.get("/currencies", { preHandler: authorize(...ALL_ROLES) }, getCurrencies);
  fastify.get("/vats", { preHandler: authorize(...ALL_ROLES) }, getVATs);
  fastify.get("/customer-tiers", { preHandler: authorize(...ALL_ROLES) }, getCustomerTiers);

  // Whitelisted IPs (operations + compliance only)
  fastify.get(
    "/whitelisted-ips",
    { preHandler: authorize(ROLES.OPERATIONS, ROLES.COMPLIANCE) },
    getWhitelistedIPs
  );
}
