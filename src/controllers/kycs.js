import KYCService from "../services/kycs.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const kycService = new KYCService();

export const getAllKYCs = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filters = {
    is_compliant: req.query.is_compliant,
    account_key: req.query.account_key,
    identification_type: req.query.identification_type,
  };
  const data = await kycService.getAll({ limit, offset, filters });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});

export const getKYC = tryCatchFunction(async (req, res) => {
  const kyc = await kycService.getByReference(req.params.reference);

  res.status(200).json({
    success: true,
    data: kyc,
  });
});

export const updateKYC = tryCatchFunction(async (req, res) => {
  const kyc = await kycService.update(req.params.reference, req.body);

  res.status(200).json({
    success: true,
    message: "KYC updated successfully",
    data: kyc,
  });
});

export const getCustomerKYCs = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const data = await kycService.getByCustomer(req.params.identifier, { limit, offset });

  res.status(200).json({
    success: true,
    ...paginatedResponse(data, page, limit),
  });
});
