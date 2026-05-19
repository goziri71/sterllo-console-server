import {
  getAllMerchants,
  getMerchant,
  getMerchantStats,
  updateMerchant,
  patchMerchantTier,
  getMerchantKYCs,
  approveMerchantKYC,
  getMerchantLedgers,
  getMerchantSettlements,
  linkMerchantBeamerAccount,
  updateMerchantBeamerAccount,
  getMerchantCustomerTransactions,
} from "../../controllers/merchants.js";
import { getMerchantCustomers } from "../../controllers/customers.js";
import { getMerchantWallets, getMerchantWallet } from "../../controllers/wallets.js";
import { getMerchantFees } from "../../controllers/fees.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function merchantRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/stats", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantStats);
  fastify.get("/", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getAllMerchants);
  fastify.get("/:account_key", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchant);
  fastify.get(
    "/:account_key/customers/:identifier/transactions",
    { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) },
    getMerchantCustomerTransactions,
  );
  fastify.get("/:account_key/customers", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantCustomers);
  fastify.get("/:account_key/ledgers", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantLedgers);
  fastify.get("/:account_key/settlements", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantSettlements);
  fastify.get("/:account_key/wallets", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantWallets);
  fastify.get("/:account_key/wallets/:wallet_key", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantWallet);
  fastify.get("/:account_key/fees", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantFees);
  fastify.get("/:account_key/kycs", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getMerchantKYCs);
  fastify.post(
    "/:account_key/kyc/approve",
    { preHandler: requirePermission(PERMISSIONS.KYC_UPDATE) },
    approveMerchantKYC,
  );

  fastify.patch("/:account_key/tier", { preHandler: requirePermission(PERMISSIONS.MERCHANT_UPDATE) }, patchMerchantTier);
  fastify.patch("/:account_key", { preHandler: requirePermission(PERMISSIONS.MERCHANT_UPDATE) }, updateMerchant);
  fastify.post(
    "/:account_key/integrations/beamer/account-link",
    { preHandler: requirePermission(PERMISSIONS.MERCHANT_UPDATE) },
    linkMerchantBeamerAccount,
  );
  fastify.post(
    "/:account_key/integrations/beamer/account-update",
    { preHandler: requirePermission(PERMISSIONS.MERCHANT_UPDATE) },
    updateMerchantBeamerAccount,
  );
}
