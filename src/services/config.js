import { eq, and, asc, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { currencies, vats, customerTiers, whitelistedIPs } from "../db/schema/config.js";

export default class ConfigService {
  async getCurrencies({ limit, offset }) {
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(currencies).limit(limit).offset(offset).orderBy(asc(currencies.name)),
      db.select({ total: count() }).from(currencies),
    ]);
    return { count: Number(total), rows };
  }

  async getVATs({ limit, offset }) {
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(vats).limit(limit).offset(offset).orderBy(asc(vats.country_code)),
      db.select({ total: count() }).from(vats),
    ]);
    return { count: Number(total), rows };
  }

  async getCustomerTiers({ limit, offset }) {
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customerTiers).limit(limit).offset(offset).orderBy(asc(customerTiers.tier)),
      db.select({ total: count() }).from(customerTiers),
    ]);
    return { count: Number(total), rows };
  }

  async getWhitelistedIPs({ limit, offset, filters }) {
    const conditions = [];
    if (filters.account_key) conditions.push(eq(whitelistedIPs.account_key, filters.account_key));
    if (filters.is_enabled) conditions.push(eq(whitelistedIPs.is_enabled, filters.is_enabled));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(whitelistedIPs).where(where).limit(limit).offset(offset).orderBy(desc(whitelistedIPs.date_created)),
      db.select({ total: count() }).from(whitelistedIPs).where(where),
    ]);
    return { count: Number(total), rows };
  }
}
