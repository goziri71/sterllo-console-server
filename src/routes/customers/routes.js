import {
  getAllCustomers,
  getCustomer,
  updateCustomer,
  getCustomerStats,
} from "../../controllers/customers.js";
import { getEnrichedCustomerWallets, getCustomerWalletDetail } from "../../controllers/wallets.js";
import { getCustomerFees } from "../../controllers/fees.js";
import { getCustomerKYCs } from "../../controllers/kycs.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, CUSTOMER_UPDATE_ROLES } from "../../config/roles.js";

export default async function customerRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  // Stats must be registered before /:identifier to avoid route conflict
  fastify.get("/stats", { preHandler: authorize(...ALL_ROLES) }, getCustomerStats);

  // Read routes (all roles)
  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllCustomers);
  fastify.get("/:identifier", { preHandler: authorize(...ALL_ROLES) }, getCustomer);
  fastify.get("/:identifier/wallets", { preHandler: authorize(...ALL_ROLES) }, getEnrichedCustomerWallets);
  fastify.get("/:identifier/wallets/:wallet_key", { preHandler: authorize(...ALL_ROLES) }, getCustomerWalletDetail);
  fastify.get("/:identifier/fees", { preHandler: authorize(...ALL_ROLES) }, getCustomerFees);
  fastify.get("/:identifier/kycs", { preHandler: authorize(...ALL_ROLES) }, getCustomerKYCs);

  // Update routes (operations + compliance only)
  fastify.patch("/:identifier", { preHandler: authorize(...CUSTOMER_UPDATE_ROLES) }, updateCustomer);
}
