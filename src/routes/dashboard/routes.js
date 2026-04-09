import { getDashboardSummary, getDashboardActivities } from "../../controllers/dashboard.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function dashboardRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDashboardSummary);
  fastify.get("/activities", { preHandler: requirePermission(PERMISSIONS.CONSOLE_READ) }, getDashboardActivities);
}
