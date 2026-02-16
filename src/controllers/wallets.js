import WalletService from "../services/wallets.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const walletService = new WalletService();

export const getMerchantWallets = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await walletService.getMerchantWallets(request.params.account_key, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant wallets fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getMerchantWallet = async (request, reply) => {
  const wallet = await walletService.getMerchantWallet(
    request.params.account_key,
    request.params.wallet_key
  );

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Merchant wallet fetched successfully",
    data: wallet,
  });
};

export const getEnrichedCustomerWallets = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await walletService.getEnrichedCustomerWallets(request.params.identifier, { limit, offset });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer wallets fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const getCustomerWalletDetail = async (request, reply) => {
  const wallet = await walletService.getCustomerWalletDetail(
    request.params.identifier,
    request.params.wallet_key
  );

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Customer wallet fetched successfully",
    data: wallet,
  });
};
