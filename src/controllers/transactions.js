import TransactionService from "../services/transactions.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const txService = new TransactionService();

function extractFilters(query) {
  return {
    account_key: query.account_key,
    wallet_key: query.wallet_key,
    status: query.status,
    from_date: query.from_date,
    to_date: query.to_date,
  };
}

export const getDeposits = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getDeposits({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getWithdrawals = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getWithdrawals({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getTransfers = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getTransfers({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getSwaps = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getSwaps({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getNGNDeposits = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getNGNDeposits({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getNGNPayouts = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getNGNPayouts({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getCryptoDeposits = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getCryptoDeposits({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getCryptoPayouts = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await txService.getCryptoPayouts({ limit, offset, filters: extractFilters(req.query) });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});
