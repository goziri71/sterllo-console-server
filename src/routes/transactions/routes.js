import {
  getDeposits,
  getWithdrawals,
  getTransfers,
  getSwaps,
  getNGNDeposits,
  getNGNPayouts,
  getCryptoDeposits,
  getCryptoPayouts,
  getTransactionStatement,
  getPendingTransactionReview,
  getPendingTransactionReviewSummary,
  approvePendingTransaction,
  cancelPendingTransaction,
} from "../../controllers/transactions.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function transactionRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/pending-review/summary",
    { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) },
    getPendingTransactionReviewSummary,
  );
  fastify.get(
    "/pending-review",
    { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) },
    getPendingTransactionReview,
  );
  fastify.post(
    "/review/:transaction_type/:reference/approve",
    { preHandler: requirePermission(PERMISSIONS.DISPUTE_UPDATE) },
    approvePendingTransaction,
  );
  fastify.post(
    "/review/:transaction_type/:reference/cancel",
    { preHandler: requirePermission(PERMISSIONS.DISPUTE_UPDATE) },
    cancelPendingTransaction,
  );

  fastify.get("/deposits", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDeposits);
  fastify.get("/withdrawals", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getWithdrawals);
  fastify.get("/transfers", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getTransfers);
  fastify.get("/swaps", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getSwaps);
  fastify.get("/ngn-deposits", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getNGNDeposits);
  fastify.get("/ngn-payouts", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getNGNPayouts);
  fastify.get("/crypto-deposits", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCryptoDeposits);
  fastify.get("/crypto-payouts", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getCryptoPayouts);
  fastify.get("/statement", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getTransactionStatement);
}
