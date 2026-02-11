import KYC from "../models/kycs/kyc.js";
import Customer from "../models/customers/customer.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class KYCService {
  constructor() {
    this.kyc = KYC;
    this.customer = Customer;
  }

  async getAll({ limit, offset, filters }) {
    const where = {};
    if (filters.is_compliant) where.is_compliant = filters.is_compliant;
    if (filters.account_key) where.account_key = filters.account_key;
    if (filters.identification_type) where.identification_type = filters.identification_type;

    return this.kyc.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async getByReference(reference) {
    const kyc = await this.kyc.findOne({
      where: { reference },
    });
    if (!kyc) {
      throw new ErrorClass("KYC not found", 404);
    }
    return kyc;
  }

  async getByCustomer(identifier, { limit, offset }) {
    const customer = await this.customer.findOne({
      where: { identifier },
    });
    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    return this.kyc.findAndCountAll({
      where: { identifier },
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }

  async update(reference, data) {
    const kyc = await this.kyc.findOne({
      where: { reference },
    });
    if (!kyc) {
      throw new ErrorClass("KYC not found", 404);
    }

    const allowedFields = ["is_compliant"];
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
    await kyc.update(updateData);
    return kyc;
  }
}
