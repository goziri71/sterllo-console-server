import DashboardService from "../services/dashboard.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";
import { ROLES } from "../config/roles.js";
import { userCanReadFinancial } from "../utils/financialAccess.js";

const dashboardService = new DashboardService();

const DASHBOARD_ROLE_PRIORITY = [
  ROLES.MANAGEMENT,
  ROLES.FINANCE,
  ROLES.OPERATIONS,
  ROLES.OPS_SUPPORT,
  ROLES.COMPLIANCE,
  ROLES.GROWTH,
];

function pickDashboardRole(roleSlugs) {
  const slugs = Array.isArray(roleSlugs) ? roleSlugs : [];
  if (slugs.length === 0) return ROLES.OPS_SUPPORT;
  const set = new Set(slugs);
  for (const r of DASHBOARD_ROLE_PRIORITY) {
    if (set.has(r)) return r;
  }
  return slugs[0];
}

export const getDashboardSummary = async (request, reply) => {
  const role = pickDashboardRole(request.user.roleSlugs);
  const revealFinancial = userCanReadFinancial(request.user);
  const data = await dashboardService.getSummary(role, { revealFinancial });

  return reply.code(200).send({ success: true, data });
};

export const getDashboardActivities = async (request, reply) => {
  const role = pickDashboardRole(request.user.roleSlugs);
  const { page, limit, offset } = parsePagination(request.query);
  const revealFinancial = userCanReadFinancial(request.user);
  const data = await dashboardService.getActivities({ role, limit, offset, revealFinancial });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};
