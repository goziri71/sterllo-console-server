import express from "express";
import { getAllKYCs, getKYC, updateKYC } from "../../controllers/kycs.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, KYC_UPDATE_ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

// Read routes (all roles)
router.get("/", authorize(...ALL_ROLES), getAllKYCs);
router.get("/:reference", authorize(...ALL_ROLES), getKYC);

// Update routes (compliance only)
router.patch("/:reference", authorize(...KYC_UPDATE_ROLES), updateKYC);

export default router;
