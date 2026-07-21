import FeeService from "../services/fees.js";
import CustomerService from "../services/customers.js";
import { requestSecurityMetadata } from "../services/mfaSecurity.js";

const feeService = new FeeService();
const customerService = new CustomerService();

const mutationContext = (request) => {
  const metadata = requestSecurityMetadata(request);
  return {
    actorUserId: request.user.id,
    actorUserKey: request.user.user_key,
    actorSessionId: request.authSession.id,
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  };
};

const pricingResponse = (reply, statusCode, message, data) =>
  reply.code(statusCode).send({
    code: statusCode,
    success: true,
    message,
    data,
  });

export const getMerchantFees = async (request, reply) => {
  const fees = await feeService.getMerchantFeesWithDefaults(request.params.account_key);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant fees fetched successfully",
    data: fees,
  });
};

export const getCustomerFees = async (request, reply) => {
  const customer = await customerService.getByIdentifier(request.params.identifier);
  const fees = await feeService.getCustomerFees(customer.account_key);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer fees fetched successfully",
    data: fees,
  });
};

export const getDefaultFees = async (request, reply) => {
  const fees = await feeService.getDefaultFees();

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Default fees fetched successfully",
    data: fees,
  });
};

export const createDefaultFee = async (request, reply) => {
  const row = await feeService.createDefaultFee(
    request.params.feeType,
    request.body,
    mutationContext(request),
  );
  return pricingResponse(reply, 201, "Default pricing created successfully", row);
};

export const updateDefaultFee = async (request, reply) => {
  const row = await feeService.updateDefaultFee(
    request.params.feeType,
    request.params.id,
    request.body,
    mutationContext(request),
  );
  return pricingResponse(reply, 200, "Default pricing updated successfully", row);
};

export const deleteDefaultFee = async (request, reply) => {
  const row = await feeService.deleteDefaultFee(
    request.params.feeType,
    request.params.id,
    mutationContext(request),
  );
  return pricingResponse(reply, 200, "Default pricing deleted successfully", row);
};

export const createMerchantFee = async (request, reply) => {
  const row = await feeService.createMerchantFee(
    request.params.account_key,
    request.params.feeType,
    request.body,
    mutationContext(request),
  );
  return pricingResponse(reply, 201, "Merchant pricing created successfully", row);
};

export const updateMerchantFee = async (request, reply) => {
  const row = await feeService.updateMerchantFee(
    request.params.account_key,
    request.params.feeType,
    request.params.id,
    request.body,
    mutationContext(request),
  );
  return pricingResponse(reply, 200, "Merchant pricing updated successfully", row);
};

export const deleteMerchantFee = async (request, reply) => {
  const row = await feeService.deleteMerchantFee(
    request.params.account_key,
    request.params.feeType,
    request.params.id,
    mutationContext(request),
  );
  return pricingResponse(reply, 200, "Merchant pricing deleted successfully", row);
};

export const listPricingAudit = async (request, reply) => {
  const rows = await feeService.listPricingAudit({
    limit: request.query?.limit,
    offset: request.query?.offset,
    feeType: request.query?.fee_type,
    accountKey: request.query?.account_key,
  });
  return pricingResponse(reply, 200, "Pricing audit events fetched successfully", rows);
};
