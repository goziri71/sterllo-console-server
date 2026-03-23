import { eq, and, desc, count, gte, lte, asc, inArray, sql, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { transactionDisputes } from "../db/schema/disputes.js";
import { customers } from "../db/schema/customers.js";
import { users } from "../db/schema/users.js";
import { transfers } from "../db/schema/transactions.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const SORTABLE_COLUMNS = {
  date_created: transactionDisputes.date_created,
  date_modified: transactionDisputes.date_modified,
  status: transactionDisputes.status,
  settlement_status: transactionDisputes.settlement_status,
};

function normalizeSort(sortBy, order) {
  const column = SORTABLE_COLUMNS[sortBy] || transactionDisputes.date_created;
  return order === "asc" ? asc(column) : desc(column);
}

function buildConditions(filters = {}) {
  const conditions = [];

  if (filters.status) conditions.push(eq(transactionDisputes.status, filters.status));
  if (filters.account_key) conditions.push(eq(transactionDisputes.account_key, filters.account_key));
  if (filters.settlement_status) conditions.push(eq(transactionDisputes.settlement_status, filters.settlement_status));
  if (filters.user_key) conditions.push(eq(transactionDisputes.user_key, filters.user_key));
  if (filters.from_date) conditions.push(gte(transactionDisputes.date_created, new Date(filters.from_date)));
  if (filters.to_date) conditions.push(lte(transactionDisputes.date_created, new Date(filters.to_date)));
  if (filters.search) {
    const pattern = `%${String(filters.search).trim()}%`;
    conditions.push(
      sql`(
        ${transactionDisputes.dispute_reference} LIKE ${pattern}
        OR ${transactionDisputes.transaction_reference} LIKE ${pattern}
        OR ${transactionDisputes.settlement_reference} LIKE ${pattern}
      )`,
    );
  }

  return conditions;
}

function formatCustomerName(customer) {
  if (!customer) return null;
  const fullName = [customer.first_name, customer.middle_name, customer.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || customer.business_name || null;
}

export default class DisputeService {
  async getAll({ limit, offset, filters }) {
    const conditions = buildConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy = normalizeSort(filters.sort_by, filters.order);

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(transactionDisputes).where(where).limit(limit).offset(offset).orderBy(orderBy),
      db.select({ total: count() }).from(transactionDisputes).where(where),
    ]);

    const enrichedRows = await this.enrichRows(rows);
    return { count: Number(total), rows: enrichedRows };
  }

  async getSummary(filters = {}) {
    const conditions = buildConditions(filters);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [summary] = await db
      .select({
        total: count(),
        in_review: count(sql`CASE WHEN ${transactionDisputes.status} IN ('PENDING', 'IN_REVIEW') THEN 1 ELSE NULL END`),
        escalated: count(sql`CASE WHEN ${transactionDisputes.status} = 'ESCALATED' THEN 1 ELSE NULL END`),
        resolved: count(sql`CASE WHEN ${transactionDisputes.status} IN ('RESOLVED', 'CLOSED') THEN 1 ELSE NULL END`),
      })
      .from(transactionDisputes)
      .where(where);

    return {
      total: Number(summary?.total || 0),
      in_review: Number(summary?.in_review || 0),
      escalated: Number(summary?.escalated || 0),
      resolved: Number(summary?.resolved || 0),
    };
  }

  async enrichRows(rows) {
    if (rows.length === 0) return rows;

    const userKeys = [...new Set(rows.map((row) => row.user_key).filter(Boolean))];
    const accountKeys = [...new Set(rows.map((row) => row.account_key).filter(Boolean))];
    const txRefs = [...new Set(rows.map((row) => row.transaction_reference).filter(Boolean))];

    const [customerRows, userRows, transferRows] = await Promise.all([
      accountKeys.length
        ? db
          .select({
            user_key: customers.user_key,
            account_key: customers.account_key,
            first_name: customers.first_name,
            middle_name: customers.middle_name,
            surname: customers.surname,
            business_name: customers.business_name,
            reference: customers.reference,
            environment: customers.environment,
          })
          .from(customers)
          .where(inArray(customers.account_key, accountKeys))
        : Promise.resolve([]),
      userKeys.length
        ? db
          .select({
            user_key: users.user_key,
            first_name: users.first_name,
            last_name: users.last_name,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.user_key, userKeys))
        : Promise.resolve([]),
      txRefs.length
        ? db
          .select({
            source_reference: transfers.source_reference,
            target_reference: transfers.target_reference,
            amount: transfers.amount,
            currency_code: transfers.currency_code,
            date_created: transfers.date_created,
          })
          .from(transfers)
          .where(
            or(
              inArray(transfers.source_reference, txRefs),
              inArray(transfers.target_reference, txRefs),
            ),
          )
        : Promise.resolve([]),
    ]);

    const customerByAccount = new Map();
    for (const customer of customerRows) {
      if (customer.account_key && !customerByAccount.has(customer.account_key)) {
        customerByAccount.set(customer.account_key, customer);
      }
    }

    const userByKey = new Map(userRows.map((user) => [user.user_key, user]));

    const transferByReference = new Map();
    for (const transfer of transferRows) {
      if (transfer.source_reference) transferByReference.set(transfer.source_reference, transfer);
      if (transfer.target_reference) transferByReference.set(transfer.target_reference, transfer);
    }

    return rows.map((row) => {
      const customer = customerByAccount.get(row.account_key);
      const owner = userByKey.get(row.user_key);
      const transfer = transferByReference.get(row.transaction_reference);
      const assignedTo = owner
        ? [owner.first_name, owner.last_name].filter(Boolean).join(" ").trim() || owner.email
        : null;

      return {
        ...row,
        dispute_id: row.dispute_reference,
        dispute_type: row.settlement_reference ? "Settlement Dispute" : "Transfer Dispute",
        customer_name: formatCustomerName(customer),
        customer_reference: customer?.reference || null,
        environment: customer?.environment || null,
        amount: transfer?.amount ? Number(transfer.amount) : null,
        currency_code: transfer?.currency_code || null,
        transaction_date: transfer?.date_created || null,
        assigned_to: assignedTo,
      };
    });
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
    const [enriched] = await this.enrichRows([dispute]);
    return enriched;
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
