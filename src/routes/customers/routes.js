import express from "express";
import {
  getAllCustomers,
  getCustomer,
  updateCustomer,
  getCustomerWallets,
} from "../../controllers/customers.js";
import { getCustomerKYCs } from "../../controllers/kycs.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, CUSTOMER_UPDATE_ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

// Read routes (all roles)
router.get("/", authorize(...ALL_ROLES), getAllCustomers);
router.get("/:identifier", authorize(...ALL_ROLES), getCustomer);
router.get("/:identifier/wallets", authorize(...ALL_ROLES), getCustomerWallets);
router.get("/:identifier/kycs", authorize(...ALL_ROLES), getCustomerKYCs);

// Update routes (operations + compliance only)
router.patch("/:identifier", authorize(...CUSTOMER_UPDATE_ROLES), updateCustomer);

export default router;
