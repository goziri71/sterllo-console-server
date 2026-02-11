import CustomerService from "../services/customers.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const customerService = new CustomerService();

export const getAllCustomers = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filters = {
    status: req.query.status,
    account_key: req.query.account_key,
    environment: req.query.environment,
  };
  const data = await customerService.getAll({ limit, offset, filters });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});

export const getCustomer = tryCatchFunction(async (req, res) => {
  const customer = await customerService.getByIdentifier(req.params.identifier);

  res.status(200).json({
    success: true,
    data: customer,
  });
});

export const updateCustomer = tryCatchFunction(async (req, res) => {
  const customer = await customerService.update(req.params.identifier, req.body);

  res.status(200).json({
    success: true,
    message: "Customer updated successfully",
    data: customer,
  });
});

export const getCustomerWallets = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await customerService.getWallets(req.params.identifier, { limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});

export const getMerchantCustomers = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await customerService.getByMerchant(req.params.account_key, { limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});
