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
import {
  getMerchantFees,
  createMerchantFee,
  updateMerchantFee,
  deleteMerchantFee,
} from "../../controllers/fees.js";
import {
  authenticate,
  requirePermission,
  requireRecentMfa,
} from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function merchantRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);
  const pricingReadGuard = requirePermission(PERMISSIONS.PRICING_READ);
  const pricingWriteGuard = [
    requirePermission(PERMISSIONS.PRICING_MANAGE),
    requireRecentMfa,
  ];

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
  fastify.get("/:account_key/fees", { preHandler: pricingReadGuard }, getMerchantFees);
  fastify.post(
    "/:account_key/fees/:feeType",
    { preHandler: pricingWriteGuard },
    createMerchantFee,
  );
  fastify.patch(
    "/:account_key/fees/:feeType/:id",
    { preHandler: pricingWriteGuard },
    updateMerchantFee,
  );
  fastify.delete(
    "/:account_key/fees/:feeType/:id",
    { preHandler: pricingWriteGuard },
    deleteMerchantFee,
  );
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
