import express from "express";
import { register, login, changePassword, getProfile } from "../../controllers/auth.js";
import { authenticate } from "../../middleware/auth.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes (require valid JWT)
router.get("/profile", authenticate, getProfile);
router.patch("/change-password", authenticate, changePassword);

export default router;
