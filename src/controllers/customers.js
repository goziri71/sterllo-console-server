import CustomerService from "../services/customers.js";
import MerchantService from "../services/merchants.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const customerService = new CustomerService();
const merchantService = new MerchantService();

export const getAllCustomers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
    environment: request.query.environment,
  };
  const sortBy = request.query.sort_by;
  const order = request.query.order;
  const data = await customerService.getAll({ limit, offset, filters, sortBy, order });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customers fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getCustomer = async (request, reply) => {
  const customer = await customerService.getByIdentifier(request.params.identifier);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer fetched successfully",
    data: customer,
  });
};

export const updateCustomer = async (request, reply) => {
  const customer = await customerService.update(request.params.identifier, request.body);

  return reply.code(200).send({
    success: true,
    message: "Customer updated successfully",
    data: customer,
  });
};

export const patchCustomerTier = async (request, reply) => {
  const customer = await customerService.setTier(request.params.identifier, request.body?.tier);

  return reply.code(200).send({
    success: true,
    message: "Customer tier updated successfully",
    data: customer,
  });
};

export const patchCustomerRestrictions = async (request, reply) => {
  const customer = await customerService.setRestrictions(request.params.identifier, request.body);

  return reply.code(200).send({
    success: true,
    message: "Customer restrictions updated successfully",
    data: customer,
  });
};

export const freezeCustomer = async (request, reply) => {
  const scope = request.body?.scope ?? "full";
  const customer = await customerService.freeze(request.params.identifier, { scope });

  return reply.code(200).send({
    success: true,
    message: "Customer restrictions applied",
    data: customer,
  });
};

export const unfreezeCustomer = async (request, reply) => {
  const customer = await customerService.unfreeze(request.params.identifier);

  return reply.code(200).send({
    success: true,
    message: "Customer posting restrictions cleared",
    data: customer,
  });
};

export const updateCustomerByHeaders = async (request, reply) => {
  const userKey = request.headers["x-user-key"];
  const accountKey = request.headers["x-account-key"];
  const customer = await customerService.updateByUserAndAccountHeaders({
    userKey,
    accountKey,
    data: request.body || {},
  });
  return reply.code(200).send({
    code: 2000,
    state: true,
    message: "Successful.",
    data: customer,
  });
};

export const getCustomerByHeaders = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const userKey = request.headers["x-user-key"];
  const accountKey = request.headers["x-account-key"];
  const reference = request.query.reference;
  const data = await customerService.getByUserAccountHeadersPaginated({
    userKey,
    accountKey,
    reference,
    limit,
    offset,
  });
  const { records, pagination } = paginatedResponse(data, page, limit);
  return reply.code(200).send({
    code: 2000,
    state: true,
    message: "Successful.",
    data: records,
    pagination,
  });
};

export const getCustomerWallets = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await customerService.getWallets(request.params.identifier, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer wallets fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getCustomerStats = async (request, reply) => {
  const data = await customerService.getStats();

  return reply.code(200).send({
    success: true,
    data,
  });
};

export const getMerchantCustomers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const sortBy = request.query.sort_by;
  const order = request.query.order;
  const [merchant, data] = await Promise.all([
    merchantService.getByAccountKey(request.params.account_key),
    customerService.getByMerchant(request.params.account_key, { limit, offset, sortBy, order }),
  ]);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant customers fetched successfully",
    merchant,
    ...paginatedResponse(data, page, limit),
  });
};

export const getCustomerViewMetrics = async (request, reply) => {
  const data = await customerService.getCustomerViewMetrics(request.params.identifier);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer view metrics fetched successfully",
    data,
  });
};
