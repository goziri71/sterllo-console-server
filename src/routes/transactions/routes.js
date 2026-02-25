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
} from "../../controllers/transactions.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function transactionRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  // All transaction routes are read-only (all roles)
  fastify.get("/deposits", { preHandler: authorize(...ALL_ROLES) }, getDeposits);
  fastify.get("/withdrawals", { preHandler: authorize(...ALL_ROLES) }, getWithdrawals);
  fastify.get("/transfers", { preHandler: authorize(...ALL_ROLES) }, getTransfers);
  fastify.get("/swaps", { preHandler: authorize(...ALL_ROLES) }, getSwaps);
  fastify.get("/ngn-deposits", { preHandler: authorize(...ALL_ROLES) }, getNGNDeposits);
  fastify.get("/ngn-payouts", { preHandler: authorize(...ALL_ROLES) }, getNGNPayouts);
  fastify.get("/crypto-deposits", { preHandler: authorize(...ALL_ROLES) }, getCryptoDeposits);
  fastify.get("/crypto-payouts", { preHandler: authorize(...ALL_ROLES) }, getCryptoPayouts);
  fastify.get("/statement", { preHandler: authorize(...ALL_ROLES) }, getTransactionStatement);
}
