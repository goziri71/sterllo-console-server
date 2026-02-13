import OverdraftService from "../services/overdrafts.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const overdraftService = new OverdraftService();

export const getAllOverdrafts = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
  };
  const data = await overdraftService.getAll({ limit, offset, filters });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getOverdraft = async (request, reply) => {
  const overdraft = await overdraftService.getByReference(request.params.reference);

  return reply.code(200).send({ success: true, data: overdraft });
};

export const updateOverdraft = async (request, reply) => {
  const overdraft = await overdraftService.update(request.params.reference, request.body);

  return reply.code(200).send({
    success: true,
    message: "Overdraft request updated successfully",
    data: overdraft,
  });
};
