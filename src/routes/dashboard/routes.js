import { getDashboardSummary, getDashboardActivities } from "../../controllers/dashboard.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ALL_ROLES } from "../../config/roles.js";

export default async function dashboardRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  fastify.get("/summary", { preHandler: authorize(...ALL_ROLES) }, getDashboardSummary);
  fastify.get("/activities", { preHandler: authorize(...ALL_ROLES) }, getDashboardActivities);
}
