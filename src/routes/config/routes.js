import {
  getCurrencies,
  getVATs,
  getCustomerTiers,
  getWhitelistedIPs,
  getFinancialInstitutions,
  getCryptoAssets,
  getDepositMethods,
} from "../../controllers/config.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function configRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/currencies", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCurrencies);
  fastify.get("/vats", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getVATs);
  fastify.get("/customer-tiers", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomerTiers);
  fastify.get("/financial-institutions", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getFinancialInstitutions);
  fastify.get("/crypto-assets", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCryptoAssets);
  fastify.get("/deposit-methods", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDepositMethods);

  fastify.get(
    "/whitelisted-ips",
    { preHandler: requirePermission(PERMISSIONS.CONFIG_WHITELIST_UPDATE) },
    getWhitelistedIPs,
  );
}
