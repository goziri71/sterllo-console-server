import TransactionService from "../services/transactions.js";
import { replayDepositWebhook as replayDepositWebhookService } from "../services/sterlloDepositWebhook.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";
import { userCanReadFinancial, redactFinancialDeep } from "../utils/financialAccess.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { CONSOLE_AUDIT_EVENT, recordConsoleAudit } from "./ops.js";

const txService = new TransactionService();

function maybeRedactTxPage(data, user) {
  if (userCanReadFinancial(user)) return data;
  return { ...data, rows: data.rows.map((row) => redactFinancialDeep(row)) };
}

function extractFilters(query) {
  return {
    account_key: query.account_key,
    user_key: query.user_key,
    identifier: query.identifier,
    wallet_key: query.wallet_key,
    status: query.status,
    pending: query.pending,
    transaction_type: query.transaction_type,
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

export const getPendingTransactionReview = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const raw = await txService.getPendingReview({ limit, offset, filters: extractFilters(request.query) });
  const data = maybeRedactTxPage(raw, request.user);

  return reply.code(200).send({
    code: 200,
    message: "Pending transactions fetched successfully",
    success: true,
    ...paginatedResponse(data, page, limit),
  });
};

export const getPendingTransactionReviewSummary = async (request, reply) => {
  const data = await txService.getPendingReviewSummary(extractFilters(request.query));

  return reply.code(200).send({
    code: 200,
    message: "Pending transaction summary fetched successfully",
    success: true,
    data,
  });
};

export const approvePendingTransaction = async (request, reply) => {
  const result = await txService.approveTransaction(
    request.params.transaction_type,
    request.params.reference,
  );

  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.TX_APPROVE,
    outcome: "success",
    target_type: "transaction",
    target_key: request.params.transaction_type,
    reference: request.params.reference,
    summary: `Approved ${request.params.transaction_type} ${request.params.reference}`,
    metadata: { status: result?.status },
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Transaction approved successfully",
    data: result,
  });
};

export const cancelPendingTransaction = async (request, reply) => {
  const result = await txService.cancelTransaction(
    request.params.transaction_type,
    request.params.reference,
  );

  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.TX_CANCEL,
    outcome: "success",
    target_type: "transaction",
    target_key: request.params.transaction_type,
    reference: request.params.reference,
    summary: `Cancelled ${request.params.transaction_type} ${request.params.reference}`,
    metadata: { status: result?.status },
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Transaction cancelled successfully",
    data: result,
  });
};

export const replayDepositWebhook = async (request, reply) => {
  const bodyIn = request.body ?? {};
  const { httpStatus, body } = await replayDepositWebhookService(bodyIn);
  const ok = httpStatus >= 200 && httpStatus < 300 && body?.state !== false;
  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.WEBHOOK_REPLAY,
    outcome: ok ? "success" : "failure",
    target_type: "deposit",
    reference: bodyIn.reference,
    account_key: bodyIn.account_key || bodyIn.accountKey || null,
    summary: `Webhook replay for deposit ${bodyIn.reference || "unknown"}`,
    metadata: { httpStatus, sterllo_message: body?.message },
  });
  return reply.code(httpStatus).send(body);
};
