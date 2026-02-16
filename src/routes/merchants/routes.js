import {
  getAllMerchants,
  getMerchant,
  updateMerchant,
  getMerchantLedgers,
  getMerchantSettlements,
} from "../../controllers/merchants.js";
import { getMerchantCustomers } from "../../controllers/customers.js";
import { getMerchantWallets, getMerchantWallet } from "../../controllers/wallets.js";
import { getMerchantFees } from "../../controllers/fees.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, MERCHANT_UPDATE_ROLES } from "../../config/roles.js";

export default async function merchantRoutes(fastify) {
  // All routes require authentication
  fastify.addHook("preHandler", authenticate);

  // Read routes (all roles)
  fastify.get("/", { preHandler: authorize(...ALL_ROLES) }, getAllMerchants);
  fastify.get("/:account_key", { preHandler: authorize(...ALL_ROLES) }, getMerchant);
  fastify.get("/:account_key/customers", { preHandler: authorize(...ALL_ROLES) }, getMerchantCustomers);
  fastify.get("/:account_key/ledgers", { preHandler: authorize(...ALL_ROLES) }, getMerchantLedgers);
  fastify.get("/:account_key/settlements", { preHandler: authorize(...ALL_ROLES) }, getMerchantSettlements);
  fastify.get("/:account_key/wallets", { preHandler: authorize(...ALL_ROLES) }, getMerchantWallets);
  fastify.get("/:account_key/wallets/:wallet_key", { preHandler: authorize(...ALL_ROLES) }, getMerchantWallet);
  fastify.get("/:account_key/fees", { preHandler: authorize(...ALL_ROLES) }, getMerchantFees);

  // Update routes (operations + compliance only)
  fastify.patch("/:account_key", { preHandler: authorize(...MERCHANT_UPDATE_ROLES) }, updateMerchant);
}
