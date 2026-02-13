import MerchantService from "../services/merchants.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const merchantService = new MerchantService();

export const getAllMerchants = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await merchantService.getAll({ limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchants fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getMerchant = async (request, reply) => {
  const merchant = await merchantService.getByAccountKey(request.params.account_key);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant fetched successfully",
    data: merchant,
  });
};

export const updateMerchant = async (request, reply) => {
  const merchant = await merchantService.update(request.params.account_key, request.body);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant updated successfully",
    data: merchant,
  });
};

export const getMerchantLedgers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await merchantService.getLedgers(request.params.account_key, { limit, offset });

  return reply.code(200).send({
    code: 200,
    message: "Merchant ledgers fetched successfully",
    success: true,
    ...paginatedResponse(data, page, limit),
  });
};

export const getMerchantSettlements = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await merchantService.getSettlements(request.params.account_key, { limit, offset });

  return reply.code(200).send({
    code: 200,
    message: "Merchant settlements fetched successfully",
    success: true,
    ...paginatedResponse(data, page, limit),
  });
};
