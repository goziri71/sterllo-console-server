import ComplianceService from "../services/compliance.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const complianceService = new ComplianceService();

export const getComplianceOverview = async (request, reply) => {
  const data = await complianceService.getOverview(request.query);
  return reply.code(200).send({ success: true, data });
};

export const getComplianceVerificationStatus = async (request, reply) => {
  const data = await complianceService.getVerificationStatus();
  return reply.code(200).send({ success: true, data });
};

export const getComplianceRiskTrends = async (request, reply) => {
  const data = await complianceService.getRiskTrends(request.query);
  return reply.code(200).send({ success: true, data });
};

export const getComplianceAlerts = async (request, reply) => {
  const { page, limit, offset, fetchLimit } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    severity: request.query.severity,
    type: request.query.type,
    search: request.query.search,
    from_date: request.query.from_date,
    to_date: request.query.to_date,
  };
  const data = await complianceService.getAlerts({ limit: fetchLimit, offset, filters });
  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getComplianceActivity = async (request, reply) => {
  const { page, limit, offset, fetchLimit } = parsePagination(request.query);
  const data = await complianceService.getActivity({ limit: fetchLimit, offset });
  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getComplianceReports = async (request, reply) => {
  const { page, limit, offset, fetchLimit } = parsePagination(request.query);
  const data = await complianceService.getReports({ limit: fetchLimit, offset });
  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getComplianceTransactionAnomalies = async (request, reply) => {
  const filters = {
    from_date: request.query.from_date,
    to_date: request.query.to_date,
    identifier: request.query.identifier,
    window_ms: request.query.window_ms,
    min_amount: request.query.min_amount,
    limit: request.query.limit,
  };
  const data = await complianceService.getTransactionAnomalies(filters);
  return reply.code(200).send({ success: true, data });
};
