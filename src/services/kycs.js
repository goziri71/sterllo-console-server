import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { kycs } from "../db/schema/kycs.js";
import { customers } from "../db/schema/customers.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class KYCService {
  async getAll({ limit, offset, filters }) {
    const conditions = [];
    if (filters.is_compliant) conditions.push(eq(kycs.is_compliant, filters.is_compliant));
    if (filters.account_key) conditions.push(eq(kycs.account_key, filters.account_key));
    if (filters.identification_type) conditions.push(eq(kycs.identification_type, filters.identification_type));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(kycs).where(where).limit(limit).offset(offset).orderBy(desc(kycs.date_created)),
      db.select({ total: count() }).from(kycs).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getByReference(reference) {
    const [kyc] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

    if (!kyc) {
      throw new ErrorClass("KYC not found", 404);
    }
    return kyc;
  }

  async getByCustomer(identifier, { limit, offset }) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const where = eq(kycs.identifier, identifier);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(kycs).where(where).limit(limit).offset(offset).orderBy(desc(kycs.date_created)),
      db.select({ total: count() }).from(kycs).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async update(reference, data) {
    const [kyc] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

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
    await db
      .update(kycs)
      .set(updateData)
      .where(eq(kycs.reference, reference));

    const [updated] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

    return updated;
  }
}
