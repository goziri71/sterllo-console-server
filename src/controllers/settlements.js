import SettlementService from "../services/settlements.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

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
  const data = await settlementService.getSummary(extractFilters(request.query));
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement summary fetched successfully",
    data,
  });
};

export const getSettlementBatches = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await settlementService.getBatches({
    limit,
    offset,
    filters: extractFilters(request.query),
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement batches fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getSettlementBatch = async (request, reply) => {
  const data = await settlementService.getBatch(request.params.batch_id);
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Settlement batch fetched successfully",
    data,
  });
};
