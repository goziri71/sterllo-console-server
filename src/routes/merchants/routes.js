import express from "express";
import {
  getAllMerchants,
  getMerchant,
  updateMerchant,
  getMerchantLedgers,
  getMerchantSettlements,
} from "../../controllers/merchants.js";
import { getMerchantCustomers } from "../../controllers/customers.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, MERCHANT_UPDATE_ROLES } from "../../config/roles.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Read routes (all roles)
router.get("/", authorize(...ALL_ROLES), getAllMerchants);
router.get("/:account_key", authorize(...ALL_ROLES), getMerchant);
router.get("/:account_key/customers", authorize(...ALL_ROLES), getMerchantCustomers);
router.get("/:account_key/ledgers", authorize(...ALL_ROLES), getMerchantLedgers);
router.get("/:account_key/settlements", authorize(...ALL_ROLES), getMerchantSettlements);

// Update routes (operations + compliance only)
router.patch("/:account_key", authorize(...MERCHANT_UPDATE_ROLES), updateMerchant);

export default router;
