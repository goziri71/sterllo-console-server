import express from "express";
import { getAllDisputes, getDispute, updateDispute } from "../../controllers/disputes.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, DISPUTE_UPDATE_ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

router.get("/", authorize(...ALL_ROLES), getAllDisputes);
router.get("/:dispute_reference", authorize(...ALL_ROLES), getDispute);
router.patch("/:dispute_reference", authorize(...DISPUTE_UPDATE_ROLES), updateDispute);

export default router;
