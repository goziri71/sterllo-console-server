import Customer from "../models/customers/customer.js";
import CustomerWallet from "../models/customerWallets/customerWallet.js";
import Merchant from "../models/merchants/merchant.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class CustomerService {
  constructor() {
    this.customer = Customer;
    this.customerWallet = CustomerWallet;
    this.merchant = Merchant;
  }

  async getAll({ limit, offset, filters }) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.account_key) where.account_key = filters.account_key;
    if (filters.environment) where.environment = filters.environment;

    return this.customer.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getByIdentifier(identifier) {
    const customer = await this.customer.findOne({
      where: { identifier },
    });
    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }
    return customer;
  }

  async getByMerchant(accountKey, { limit, offset }) {
    const merchant = await this.merchant.findOne({
      where: { account_key: accountKey },
    });
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    return this.customer.findAndCountAll({
      where: { account_key: accountKey },
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async update(identifier, data) {
    const customer = await this.customer.findOne({
      where: { identifier },
    });
    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const allowedFields = [
      "status",
      "is_pnd",
      "is_pnc",
      "is_personal_compliant",
      "is_business_compliant",
      "tier",
    ];
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
    await customer.update(updateData);
    return customer;
  }

  async getWallets(identifier, { limit, offset }) {
    const customer = await this.customer.findOne({
      where: { identifier },
    });
    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    return this.customerWallet.findAndCountAll({
      where: { identifier },
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }
}
