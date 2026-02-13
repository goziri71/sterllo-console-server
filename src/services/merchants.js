import { eq, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants } from "../db/schema/merchants.js";
import { merchantLedgers, settlementLedgers } from "../db/schema/merchants.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class MerchantService {
  async getAll({ limit, offset }) {
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(merchants).limit(limit).offset(offset).orderBy(desc(merchants.date_created)),
      db.select({ total: count() }).from(merchants),
    ]);
    return { count: Number(total), rows };
  }

  async getByAccountKey(accountKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }
    return merchant;
  }

  async update(accountKey, data) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

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
    await db
      .update(merchants)
      .set(updateData)
      .where(eq(merchants.account_key, accountKey));

    const [updated] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    return updated;
  }

  async getLedgers(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(merchantLedgers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(merchantLedgers).where(where).limit(limit).offset(offset).orderBy(desc(merchantLedgers.date_created)),
      db.select({ total: count() }).from(merchantLedgers).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getSettlements(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(settlementLedgers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(settlementLedgers).where(where).limit(limit).offset(offset).orderBy(desc(settlementLedgers.date_created)),
      db.select({ total: count() }).from(settlementLedgers).where(where),
    ]);
    return { count: Number(total), rows };
  }
}
