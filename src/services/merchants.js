import Merchant from "../models/merchants/merchant.js";
import MerchantLedger from "../models/merchantLedgers/merchantLedger.js";
import SettlementLedger from "../models/settlementLedgers/settlementLedger.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class MerchantService {
  constructor() {
    this.merchant = Merchant;
    this.merchantLedger = MerchantLedger;
    this.settlementLedger = SettlementLedger;
  }

  async getAll({ limit, offset }) {
    return this.merchant.findAndCountAll({
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getByAccountKey(accountKey) {
    const merchant = await this.merchant.findOne({
      where: { account_key: accountKey },
    });
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }
    return merchant;
  }

  async update(accountKey, data) {
    const merchant = await this.merchant.findOne({
      where: { account_key: accountKey },
    });
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const allowedFields = ["name", "trade_name", "default_kyc_tier"];
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
    await merchant.update(updateData);
    return merchant;
  }

  async getLedgers(accountKey, { limit, offset }) {
    const merchant = await this.merchant.findOne({
      where: { account_key: accountKey },
    });
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    return this.merchantLedger.findAndCountAll({
      where: { account_key: accountKey },
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getSettlements(accountKey, { limit, offset }) {
    const merchant = await this.merchant.findOne({
      where: { account_key: accountKey },
    });
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    return this.settlementLedger.findAndCountAll({
      where: { account_key: accountKey },
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }
}
