import Currency from "../models/currencies/currency.js";
import VAT from "../models/vats/vat.js";
import CustomerTier from "../models/customerTiers/customerTier.js";
import WhitelistedIP from "../models/whitelistedIPs/whitelistedIP.js";

export default class ConfigService {
  async getCurrencies({ limit, offset }) {
    return Currency.findAndCountAll({
      limit,
      offset,
      order: [["name", "ASC"]],
    });
  }

  async getVATs({ limit, offset }) {
    return VAT.findAndCountAll({
      limit,
      offset,
      order: [["country_code", "ASC"]],
    });
  }

  async getCustomerTiers({ limit, offset }) {
    return CustomerTier.findAndCountAll({
      limit,
      offset,
      order: [["tier", "ASC"]],
    });
  }

  async getWhitelistedIPs({ limit, offset, filters }) {
    const where = {};
    if (filters.account_key) where.account_key = filters.account_key;
    if (filters.is_enabled) where.is_enabled = filters.is_enabled;

    return WhitelistedIP.findAndCountAll({
      where,
      limit,
      offset,
      order: [["date_created", "DESC"]],
    });
  }
}
