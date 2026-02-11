import OverdraftRequest from "../models/overdrafts/overdraft.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class OverdraftService {
  constructor() {
    this.overdraft = OverdraftRequest;
  }

  async getAll({ limit, offset, filters }) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.account_key) where.account_key = filters.account_key;

    return this.overdraft.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getByReference(reference) {
    const overdraft = await this.overdraft.findOne({
      where: { reference },
    });
    if (!overdraft) {
      throw new ErrorClass("Overdraft request not found", 404);
    }
    return overdraft;
  }

  async update(reference, data) {
    const overdraft = await this.overdraft.findOne({
      where: { reference },
    });
    if (!overdraft) {
      throw new ErrorClass("Overdraft request not found", 404);
    }

    const allowedFields = ["status"];
    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ErrorClass("No valid fields to update", 400);
    }

    updateData.date_modified = new Date();
    await overdraft.update(updateData);
    return overdraft;
  }
}
