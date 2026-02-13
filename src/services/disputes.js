import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactionDisputes } from "../db/schema/disputes.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class DisputeService {
  async getAll({ limit, offset, filters }) {
    const conditions = [];
    if (filters.status) conditions.push(eq(transactionDisputes.status, filters.status));
    if (filters.account_key) conditions.push(eq(transactionDisputes.account_key, filters.account_key));
    if (filters.settlement_status) conditions.push(eq(transactionDisputes.settlement_status, filters.settlement_status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(transactionDisputes).where(where).limit(limit).offset(offset).orderBy(desc(transactionDisputes.date_created)),
      db.select({ total: count() }).from(transactionDisputes).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getByReference(disputeReference) {
    const [dispute] = await db
      .select()
      .from(transactionDisputes)
      .where(eq(transactionDisputes.dispute_reference, disputeReference))
      .limit(1);

    if (!dispute) {
      throw new ErrorClass("Dispute not found", 404);
    }
    return dispute;
  }

  async update(disputeReference, data) {
    const [dispute] = await db
      .select()
      .from(transactionDisputes)
      .where(eq(transactionDisputes.dispute_reference, disputeReference))
      .limit(1);

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
    await db
      .update(transactionDisputes)
      .set(updateData)
      .where(eq(transactionDisputes.dispute_reference, disputeReference));

    const [updated] = await db
      .select()
      .from(transactionDisputes)
      .where(eq(transactionDisputes.dispute_reference, disputeReference))
      .limit(1);

    return updated;
  }
}
