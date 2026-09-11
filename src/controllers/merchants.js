import MerchantService from "../services/merchants.js";
import CustomerService from "../services/customers.js";
import TransactionService from "../services/transactions.js";
import KYCService from "../services/kycs.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";
import { userCanReadFinancial } from "../utils/financialAccess.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { CONSOLE_AUDIT_EVENT, recordConsoleAudit } from "./ops.js";

const merchantService = new MerchantService();
const customerService = new CustomerService();
const transactionService = new TransactionService();
const kycService = new KYCService();

export const getAllMerchants = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    name: request.query.name,
    trade_name: request.query.trade_name,
  };
  const sortBy = request.query.sort_by;
  const order = request.query.order;
  const data = await merchantService.getAll({ limit, offset, filters, sortBy, order });

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

export const getMerchantStats = async (request, reply) => {
  const data = await merchantService.getStats();

  return reply.code(200).send({
    success: true,
    data,
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

export const patchMerchantTier = async (request, reply) => {
  const merchant = await merchantService.setDefaultKycTier(request.params.account_key, request.body?.tier);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant default KYC tier updated successfully",
    data: merchant,
  });
};

export const getMerchantKYCs = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await kycService.getByMerchant(request.params.account_key, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant KYC records fetched successfully",
    merchant: data.merchant,
    ...paginatedResponse({ count: data.count, rows: data.rows }, page, limit),
  });
};

export const approveMerchantKYC = async (request, reply) => {
  const data = await kycService.approveMerchant(request.params.account_key, request.body ?? {});

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant KYC approved successfully",
    data,
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

export const linkMerchantBeamerAccount = async (request, reply) => {
  const { httpStatus, body } = await merchantService.linkBeamerAccount(
    request.params.account_key,
    request.body ?? {},
  );
  const ok = httpStatus >= 200 && httpStatus < 300 && body?.state !== false;
  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.BEAMER_LINK,
    outcome: ok ? "success" : "failure",
    account_key: request.params.account_key,
    target_type: "merchant",
    target_key: request.params.account_key,
    summary: `Beamer account link for ${request.params.account_key}`,
    metadata: { httpStatus, isvs_code: body?.code, isvs_message: body?.message },
  });
  return reply.code(httpStatus).send(body);
};

export const updateMerchantBeamerAccount = async (request, reply) => {
  const { httpStatus, body } = await merchantService.updateBeamerAccount(
    request.params.account_key,
    request.body ?? {},
  );
  const ok = httpStatus >= 200 && httpStatus < 300 && body?.state !== false;
  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.BEAMER_UPDATE,
    outcome: ok ? "success" : "failure",
    account_key: request.params.account_key,
    target_type: "merchant",
    target_key: request.params.account_key,
    summary: `Beamer account update for ${request.params.account_key}`,
    metadata: { httpStatus, isvs_code: body?.code, isvs_message: body?.message },
  });
  return reply.code(httpStatus).send(body);
};

export const tsqMerchantBeamerNgnPayout = async (request, reply) => {
  const bodyIn = request.body ?? {};
  const reference = bodyIn?.data?.reference || bodyIn?.reference || null;
  const { httpStatus, body } = await merchantService.tsqBeamerNgnPayout(
    request.params.account_key,
    bodyIn,
  );
  const ok = httpStatus >= 200 && httpStatus < 300 && body?.state !== false;
  await recordConsoleAudit(request, {
    event_type: CONSOLE_AUDIT_EVENT.BEAMER_NGN_TSQ,
    outcome: ok ? "success" : "failure",
    account_key: request.params.account_key,
    target_type: "ngn_payout",
    target_key: request.params.account_key,
    reference,
    summary: `Beamer NGN TSQ resolve for ${reference || "unknown"}`,
    metadata: { httpStatus, isvs_code: body?.code, isvs_message: body?.message },
  });
  return reply.code(httpStatus).send(body);
};

/**
 * All transactions for a customer under this merchant (unified statement).
 * Same payload as GET /api/v1/transactions/statement?identifier=&account_key=.
 */
export const getMerchantCustomerTransactions = async (request, reply) => {
  if (!userCanReadFinancial(request.user)) {
    throw new ErrorClass("Customer transactions require financial.read permission", 403);
  }
  const { account_key, identifier } = request.params;
  await customerService.ensureCustomerBelongsToMerchant(identifier, account_key);

  const { page, limit, offset } = parsePagination(request.query);
  const data = await transactionService.getStatement({
    limit,
    offset,
    filters: {
      account_key,
      identifier,
      wallet_key: request.query.wallet_key,
      status: request.query.status,
      currency_code: request.query.currency_code,
      search: request.query.search,
      from_date: request.query.from_date,
      to_date: request.query.to_date,
    },
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer transactions fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};
