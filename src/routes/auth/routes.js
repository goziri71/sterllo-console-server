import {
  loginWithPassword,
  confirmMfaEnrollment,
  completeMfaLogin,
  logout,
  logoutAll,
  listSessions,
  regenerateRecoveryCodes,
  verifyMfaStepUp,
  getProfile,
} from "../../controllers/auth.js";
import { authenticate } from "../../middleware/auth.js";

export default async function authRoutes(fastify) {
  // Login: Alpha email/password → MFA only (Crosslink removed)
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "15 minutes" },
      },
    },
    loginWithPassword,
  );

  fastify.post(
    "/mfa/enroll/confirm",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    confirmMfaEnrollment,
  );
  fastify.post(
    "/mfa/challenge/verify",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    completeMfaLogin,
  );

  fastify.post(
    "/logout",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 120, timeWindow: "15 minutes" },
      },
    },
    logout,
  );
  fastify.get("/profile", { preHandler: authenticate }, getProfile);
  fastify.get("/sessions", { preHandler: authenticate }, listSessions);
  fastify.post(
    "/logout-all",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 20, timeWindow: "15 minutes" },
      },
    },
    logoutAll,
  );
  fastify.post(
    "/mfa/recovery-codes/regenerate",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
    },
    regenerateRecoveryCodes,
  );
  fastify.post(
    "/mfa/step-up",
    {
      preHandler: authenticate,
      config: {
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    verifyMfaStepUp,
  );
}
