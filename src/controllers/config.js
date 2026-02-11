import ConfigService from "../services/config.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const configService = new ConfigService();

export const getCurrencies = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await configService.getCurrencies({ limit, offset });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getVATs = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await configService.getVATs({ limit, offset });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getCustomerTiers = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await configService.getCustomerTiers({ limit, offset });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getWhitelistedIPs = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filters = {
    account_key: req.query.account_key,
    is_enabled: req.query.is_enabled,
  };
  const data = await configService.getWhitelistedIPs({ limit, offset, filters });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});
