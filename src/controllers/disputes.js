import DisputeService from "../services/disputes.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const disputeService = new DisputeService();

export const getDisputesSummary = async (request, reply) => {
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
    identifier: request.query.identifier,
    settlement_status: request.query.settlement_status,
    user_key: request.query.user_key,
    search: request.query.search,
    from_date: request.query.from_date,
    to_date: request.query.to_date,
  };

  const data = await disputeService.getSummary(filters);
  return reply.code(200).send({ success: true, data });
};

export const getAllDisputes = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
    identifier: request.query.identifier,
    settlement_status: request.query.settlement_status,
    user_key: request.query.user_key,
    search: request.query.search,
    from_date: request.query.from_date,
    to_date: request.query.to_date,
    sort_by: request.query.sort_by,
    order: request.query.order,
  };
  const data = await disputeService.getAll({ limit, offset, filters });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getDispute = async (request, reply) => {
  const dispute = await disputeService.getByReference(request.params.dispute_reference);

  return reply.code(200).send({ success: true, data: dispute });
};

export const updateDispute = async (request, reply) => {
  const dispute = await disputeService.update(request.params.dispute_reference, request.body);

  return reply.code(200).send({
    success: true,
    message: "Dispute updated successfully",
    data: dispute,
  });
};
