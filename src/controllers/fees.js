import FeeService from "../services/fees.js";
import CustomerService from "../services/customers.js";

const feeService = new FeeService();
const customerService = new CustomerService();

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
