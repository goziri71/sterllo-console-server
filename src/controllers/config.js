import ConfigService from "../services/config.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const configService = new ConfigService();

export const getCurrencies = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await configService.getCurrencies({ limit, offset });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getVATs = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await configService.getVATs({ limit, offset });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getCustomerTiers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await configService.getCustomerTiers({ limit, offset });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};

export const getWhitelistedIPs = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    account_key: request.query.account_key,
    is_enabled: request.query.is_enabled,
  };
  const data = await configService.getWhitelistedIPs({ limit, offset, filters });

  return reply.code(200).send({ success: true, ...paginatedResponse(data, page, limit) });
};
