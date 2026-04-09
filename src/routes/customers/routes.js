import {
  getAllCustomers,
  getCustomer,
  updateCustomer,
  getCustomerStats,
  updateCustomerByHeaders,
  getCustomerByHeaders,
} from "../../controllers/customers.js";
import { getEnrichedCustomerWallets, getCustomerWalletDetail } from "../../controllers/wallets.js";
import { getCustomerFees } from "../../controllers/fees.js";
import { getCustomerKYCs } from "../../controllers/kycs.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function customerRoutes(fastify) {
  // No JWT: lookup via x-user-key + x-account-key headers only
  fastify.get("/detail", getCustomerByHeaders);
  fastify.patch("/update", updateCustomerByHeaders);

  await fastify.register(async function securedRoutes(f) {
    f.addHook("preHandler", authenticate);

    // Stats must be registered before /:identifier to avoid route conflict
    f.get("/stats", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomerStats);

    f.get("/", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getAllCustomers);
    f.get("/:identifier", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomer);
    f.get("/:identifier/wallets", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getEnrichedCustomerWallets);
    f.get("/:identifier/wallets/:wallet_key", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomerWalletDetail);
    f.get("/:identifier/fees", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomerFees);
    f.get("/:identifier/kycs", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCustomerKYCs);

    f.patch("/:identifier", { preHandler: requirePermission(PERMISSIONS.CUSTOMER_UPDATE) }, updateCustomer);
  });
}
