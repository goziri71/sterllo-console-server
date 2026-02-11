import DisputeService from "../services/disputes.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const disputeService = new DisputeService();

export const getAllDisputes = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filters = {
    status: req.query.status,
    account_key: req.query.account_key,
    settlement_status: req.query.settlement_status,
  };
  const data = await disputeService.getAll({ limit, offset, filters });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getDispute = tryCatchFunction(async (req, res) => {
  const dispute = await disputeService.getByReference(req.params.dispute_reference);

  res.status(200).json({ success: true, data: dispute });
});

export const updateDispute = tryCatchFunction(async (req, res) => {
  const dispute = await disputeService.update(req.params.dispute_reference, req.body);

  res.status(200).json({
    success: true,
    message: "Dispute updated successfully",
    data: dispute,
  });
});
