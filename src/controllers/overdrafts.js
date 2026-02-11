import OverdraftService from "../services/overdrafts.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const overdraftService = new OverdraftService();

export const getAllOverdrafts = tryCatchFunction(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const filters = {
    status: req.query.status,
    account_key: req.query.account_key,
  };
  const data = await overdraftService.getAll({ limit, offset, filters });

  res.status(200).json({ success: true, ...paginatedResponse(data, page, limit) });
});

export const getOverdraft = tryCatchFunction(async (req, res) => {
  const overdraft = await overdraftService.getByReference(req.params.reference);

  res.status(200).json({ success: true, data: overdraft });
});

export const updateOverdraft = tryCatchFunction(async (req, res) => {
  const overdraft = await overdraftService.update(req.params.reference, req.body);

  res.status(200).json({
    success: true,
    message: "Overdraft request updated successfully",
    data: overdraft,
  });
});
