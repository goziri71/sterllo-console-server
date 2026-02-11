import express from "express";
import { getAllOverdrafts, getOverdraft, updateOverdraft } from "../../controllers/overdrafts.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES, OVERDRAFT_UPDATE_ROLES } from "../../config/roles.js";

const router = express.Router();

router.use(authenticate);

router.get("/", authorize(...ALL_ROLES), getAllOverdrafts);
router.get("/:reference", authorize(...ALL_ROLES), getOverdraft);
router.patch("/:reference", authorize(...OVERDRAFT_UPDATE_ROLES), updateOverdraft);

export default router;
