import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers } from "../db/schema/customers.js";
import { customerWallets } from "../db/schema/customers.js";
import { merchants } from "../db/schema/merchants.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export default class CustomerService {
  async getAll({ limit, offset, filters }) {
    const conditions = [];
    if (filters.status) conditions.push(eq(customers.status, filters.status));
    if (filters.account_key) conditions.push(eq(customers.account_key, filters.account_key));
    if (filters.environment) conditions.push(eq(customers.environment, filters.environment));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customers).where(where).limit(limit).offset(offset).orderBy(desc(customers.date_created)),
      db.select({ total: count() }).from(customers).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getByIdentifier(identifier) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }
    return customer;
  }

  async getByMerchant(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(customers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customers).where(where).limit(limit).offset(offset).orderBy(desc(customers.date_created)),
      db.select({ total: count() }).from(customers).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async update(identifier, data) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

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
    await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.identifier, identifier));

    const [updated] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    return updated;
  }

  async getWallets(identifier, { limit, offset }) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const where = eq(customerWallets.identifier, identifier);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customerWallets).where(where).limit(limit).offset(offset).orderBy(desc(customerWallets.date_created)),
      db.select({ total: count() }).from(customerWallets).where(where),
    ]);
    return { count: Number(total), rows };
  }
}
