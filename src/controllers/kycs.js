import KYCService from "../services/kycs.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const kycService = new KYCService();

export const getAllKYCs = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    is_compliant: request.query.is_compliant,
    account_key: request.query.account_key,
    identification_type: request.query.identification_type,
  };
  const data = await kycService.getAll({ limit, offset, filters });

  return reply.code(200).send({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
};

export const getKYC = async (request, reply) => {
  const kyc = await kycService.getByReference(request.params.reference);

  return reply.code(200).send({
    success: true,
    data: kyc,
  });
};

export const updateKYC = async (request, reply) => {
  const kyc = await kycService.update(request.params.reference, request.body);

  return reply.code(200).send({
    success: true,
    message: "KYC updated successfully",
    data: kyc,
  });
};

/** Proxies Redbiller GET /v1/auth/sub-accounts/kyc/status/enable using customer keys. */
export const getCustomerSubAccountKycEnableStatus = async (request, reply) => {
  const upstream = await kycService.getSubAccountKycEnableStatus(request.params.identifier);
  const httpStatus =
    upstream.status >= 100 && upstream.status < 600 ? upstream.status : 502;

  return reply.code(httpStatus).send(upstream.data ?? {});
};

export const getCustomerKYCs = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const { customer, count, rows } = await kycService.getByCustomer(request.params.identifier, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer KYC records fetched successfully",
    customer,
    ...paginatedResponse({ count, rows }, page, limit),
  });
};
