import CustomerService from "../services/customers.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const customerService = new CustomerService();

export const getAllCustomers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const filters = {
    status: request.query.status,
    account_key: request.query.account_key,
    environment: request.query.environment,
  };
  const data = await customerService.getAll({ limit, offset, filters });

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

export const getMerchantCustomers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await customerService.getByMerchant(request.params.account_key, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant customers fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};
