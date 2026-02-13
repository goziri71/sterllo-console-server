import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { overdraftRequests } from "../db/schema/overdrafts.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class OverdraftService {
  async getAll({ limit, offset, filters }) {
    const conditions = [];
    if (filters.status) conditions.push(eq(overdraftRequests.status, filters.status));
    if (filters.account_key) conditions.push(eq(overdraftRequests.account_key, filters.account_key));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(overdraftRequests).where(where).limit(limit).offset(offset).orderBy(desc(overdraftRequests.date_created)),
      db.select({ total: count() }).from(overdraftRequests).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getByReference(reference) {
    const [overdraft] = await db
      .select()
      .from(overdraftRequests)
      .where(eq(overdraftRequests.reference, reference))
      .limit(1);

    if (!overdraft) {
      throw new ErrorClass("Overdraft request not found", 404);
    }
    return overdraft;
  }

  async update(reference, data) {
    const [overdraft] = await db
      .select()
      .from(overdraftRequests)
      .where(eq(overdraftRequests.reference, reference))
      .limit(1);

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
    await db
      .update(overdraftRequests)
      .set(updateData)
      .where(eq(overdraftRequests.reference, reference));

    const [updated] = await db
      .select()
      .from(overdraftRequests)
      .where(eq(overdraftRequests.reference, reference))
      .limit(1);

    return updated;
  }
}
