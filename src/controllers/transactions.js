import TransactionService from "../services/transactions.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";
import { userCanReadFinancial, redactFinancialDeep } from "../utils/financialAccess.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const txService = new TransactionService();

function maybeRedactTxPage(data, user) {
  if (userCanReadFinancial(user)) return data;
  return { ...data, rows: data.rows.map((row) => redactFinancialDeep(row)) };
}

function extractFilters(query) {
  return {
    account_key: query.account_key,
    wallet_key: query.wallet_key,
    status: query.status,
    currency_code: query.currency_code,
    search: query.search,
    from_date: query.from_date,
    to_date: query.to_date,
  };
}

export const getDeposits = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getDeposits({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "Deposits fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getWithdrawals = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getWithdrawals({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({
    code: 200,
    message: "Withdrawals fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getTransfers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getTransfers({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "Transfers fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getSwaps = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getSwaps({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "Swaps fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getNGNDeposits = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getNGNDeposits({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "NGN Deposits fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getNGNPayouts = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getNGNPayouts({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "NGN Payouts fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getCryptoDeposits = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getCryptoDeposits({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "Crypto Deposits fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getCryptoPayouts = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getCryptoPayouts({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({ 
    code: 200,
    message: "Crypto Payouts fetched successfully",
    success: true, 
    ...paginatedResponse(data, page, limit) });
};

export const getTransactionStatement = async (request, reply) => {
  if (!userCanReadFinancial(request.user)) {
    throw new ErrorClass("Transaction statement requires financial.read permission", 403);
  }
  const { page, limit, offset } = parsePagination(request.query);
  const data = await txService.getStatement({ limit, offset, filters: extractFilters(request.query) });

  return reply.code(200).send({
    code: 200,
    message: "Transaction statement fetched successfully",
    success: true,
    ...paginatedResponse(data, page, limit),
  });
};
