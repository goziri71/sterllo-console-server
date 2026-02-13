import {
  getAllCustomers,
  getCustomer,
  updateCustomer,
  getCustomerWallets,
} from "../../controllers/customers.js";
import { getCustomerKYCs } from "../../controllers/kycs.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, CUSTOMER_UPDATE_ROLES } from "../../config/roles.js";

export default async function customerRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  // Read routes (all roles)
  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllCustomers);
  fastify.get("/:identifier", { preHandler: authorize(...ALL_ROLES) }, getCustomer);
  fastify.get("/:identifier/wallets", { preHandler: authorize(...ALL_ROLES) }, getCustomerWallets);
  fastify.get("/:identifier/kycs", { preHandler: authorize(...ALL_ROLES) }, getCustomerKYCs);

  // Update routes (operations + compliance only)
  fastify.patch("/:identifier", { preHandler: authorize(...CUSTOMER_UPDATE_ROLES) }, updateCustomer);
}
