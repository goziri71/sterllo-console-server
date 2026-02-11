import MerchantService from "../services/merchants.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const merchantService = new MerchantService();

export const getAllMerchants = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await merchantService.getAll({ limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});

export const getMerchant = tryCatchFunction(async (req, res) => {
  const merchant = await merchantService.getByAccountKey(req.params.account_key);

  res.status(200).json({
    success: true,
    data: merchant,
  });
});

export const updateMerchant = tryCatchFunction(async (req, res) => {
  const merchant = await merchantService.update(req.params.account_key, req.body);

  res.status(200).json({
    success: true,
    message: "Merchant updated successfully",
    data: merchant,
  });
});

export const getMerchantLedgers = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await merchantService.getLedgers(req.params.account_key, { limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});

export const getMerchantSettlements = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await merchantService.getSettlements(req.params.account_key, { limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});
