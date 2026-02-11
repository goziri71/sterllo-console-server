import express from "express";
import {
  getDeposits,
  getWithdrawals,
  getTransfers,
  getSwaps,
  getNGNDeposits,
  getNGNPayouts,
  getCryptoDeposits,
  getCryptoPayouts,
} from "../../controllers/transactions.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

// All transaction routes are read-only (all roles)
router.get("/deposits", authorize(...ALL_ROLES), getDeposits);
router.get("/withdrawals", authorize(...ALL_ROLES), getWithdrawals);
router.get("/transfers", authorize(...ALL_ROLES), getTransfers);
router.get("/swaps", authorize(...ALL_ROLES), getSwaps);
router.get("/ngn-deposits", authorize(...ALL_ROLES), getNGNDeposits);
router.get("/ngn-payouts", authorize(...ALL_ROLES), getNGNPayouts);
router.get("/crypto-deposits", authorize(...ALL_ROLES), getCryptoDeposits);
router.get("/crypto-payouts", authorize(...ALL_ROLES), getCryptoPayouts);

export default router;
