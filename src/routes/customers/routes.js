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
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, CUSTOMER_UPDATE_ROLES } from "../../config/roles.js";

export default async function customerRoutes(fastify) {
  // No JWT: lookup via x-user-key + x-account-key headers only
  fastify.get("/detail", getCustomerByHeaders);
  fastify.patch("/update", updateCustomerByHeaders);

  await fastify.register(async function securedRoutes(f) {
    f.addHook("preHandler", authenticate);

    // Stats must be registered before /:identifier to avoid route conflict
    f.get("/stats", { preHandler: authorize(...ALL_ROLES) }, getCustomerStats);

    // Read routes (all roles)
    f.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllCustomers);
    f.get("/:identifier", { preHandler: authorize(...ALL_ROLES) }, getCustomer);
    f.get("/:identifier/wallets", { preHandler: authorize(...ALL_ROLES) }, getEnrichedCustomerWallets);
    f.get("/:identifier/wallets/:wallet_key", { preHandler: authorize(...ALL_ROLES) }, getCustomerWalletDetail);
    f.get("/:identifier/fees", { preHandler: authorize(...ALL_ROLES) }, getCustomerFees);
    f.get("/:identifier/kycs", { preHandler: authorize(...ALL_ROLES) }, getCustomerKYCs);

    // Update routes (operations + compliance only)
    f.patch("/:identifier", { preHandler: authorize(...CUSTOMER_UPDATE_ROLES) }, updateCustomer);
  });
}
