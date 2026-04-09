import {
  getComplianceActivity,
  getComplianceAlerts,
  getComplianceOverview,
  getComplianceReports,
  getComplianceRiskTrends,
  getComplianceVerificationStatus,
} from "../../controllers/compliance.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function complianceRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/overview", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceOverview);
  fastify.get("/verification-status", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceVerificationStatus);
  fastify.get("/risk-trends", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceRiskTrends);
  fastify.get("/alerts", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceAlerts);
  fastify.get("/activity", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceActivity);
  fastify.get("/reports", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getComplianceReports);
}
