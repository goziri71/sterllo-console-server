import DisputeService from "../services/disputes.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const disputeService = new DisputeService();

export const getAllDisputes = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
    settlement_status: request.query.settlement_status,
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
