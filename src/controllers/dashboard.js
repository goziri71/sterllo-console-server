import DashboardService from "../services/dashboard.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const dashboardService = new DashboardService();

export const getDashboardSummary = async (request, reply) => {
  const { role } = request.user;
  const data = await dashboardService.getSummary(role);

  return reply.code(200).send({ success: true, data });
};

export const getDashboardActivities = async (request, reply) => {
  const { role } = request.user;
  const { page, limit, offset } = parsePagination(request.query);
  const data = await dashboardService.getActivities({ role, limit, offset });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};
