import express from "express";
import { getCurrencies, getVATs, getCustomerTiers, getWhitelistedIPs } from "../../controllers/config.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

// Read-only config routes (all roles)
router.get("/currencies", authorize(...ALL_ROLES), getCurrencies);
router.get("/vats", authorize(...ALL_ROLES), getVATs);
router.get("/customer-tiers", authorize(...ALL_ROLES), getCustomerTiers);

// Whitelisted IPs (operations + compliance only)
router.get(
  "/whitelisted-ips",
  authorize(ROLES.OPERATIONS, ROLES.COMPLIANCE),
  getWhitelistedIPs
);

export default router;
