import SettlementService from "../services/settlements.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";
import { userCanReadFinancial, redactFinancialDeep } from "../utils/financialAccess.js";

const settlementService = new SettlementService();

function extractFilters(query) {
  return {
    account_key: query.account_key,
    currency_code: query.currency_code,
    status: query.status,
    search: query.search,
    from_date: query.from_date,
    to_date: query.to_date,
  };
}

export const getSettlementSummary = async (request, reply) => {
  const raw = await settlementService.getSummary(extractFilters(request.query));
  const data = userCanReadFinancial(request.user) ? raw : redactFinancialDeep(raw);
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement summary fetched successfully",
    data,
  });
};

export const getSettlementBatches = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await settlementService.getBatches({
    limit,
    offset,
    filters: extractFilters(request.query),
  });
  const data = userCanReadFinancial(request.user)
    ? raw
    : { ...raw, rows: raw.rows.map((row) => redactFinancialDeep(row)) };

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement batches fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getSettlementBatch = async (request, reply) => {
  const raw = await settlementService.getBatch(request.params.batch_id);
  const data = userCanReadFinancial(request.user) ? raw : redactFinancialDeep(raw);
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement batch fetched successfully",
    data,
  });
};
