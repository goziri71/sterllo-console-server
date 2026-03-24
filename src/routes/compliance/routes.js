import {
  getComplianceActivity,
  getComplianceAlerts,
  getComplianceOverview,
  getComplianceReports,
  getComplianceRiskTrends,
  getComplianceVerificationStatus,
} from "../../controllers/compliance.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function complianceRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/overview", { preHandler: authorize(...ALL_ROLES) }, getComplianceOverview);
  fastify.get("/verification-status", { preHandler: authorize(...ALL_ROLES) }, getComplianceVerificationStatus);
  fastify.get("/risk-trends", { preHandler: authorize(...ALL_ROLES) }, getComplianceRiskTrends);
  fastify.get("/alerts", { preHandler: authorize(...ALL_ROLES) }, getComplianceAlerts);
  fastify.get("/activity", { preHandler: authorize(...ALL_ROLES) }, getComplianceActivity);
  fastify.get("/reports", { preHandler: authorize(...ALL_ROLES) }, getComplianceReports);
}
