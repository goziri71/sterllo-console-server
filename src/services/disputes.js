import TransactionDispute from "../models/disputes/dispute.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class DisputeService {
  constructor() {
    this.dispute = TransactionDispute;
  }

  async getAll({ limit, offset, filters }) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.account_key) where.account_key = filters.account_key;
    if (filters.settlement_status) where.settlement_status = filters.settlement_status;

    return this.dispute.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getByReference(disputeReference) {
    const dispute = await this.dispute.findOne({
      where: { dispute_reference: disputeReference },
    });
    if (!dispute) {
      throw new ErrorClass("Dispute not found", 404);
    }
    return dispute;
  }

  async update(disputeReference, data) {
    const dispute = await this.dispute.findOne({
      where: { dispute_reference: disputeReference },
    });
    if (!dispute) {
      throw new ErrorClass("Dispute not found", 404);
    }

    const allowedFields = ["status", "settlement_status"];
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
    await dispute.update(updateData);
    return dispute;
  }
}
