import { eq, and, ne, or, desc, asc, count, sql, gte, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { merchants } from "../db/schema/merchants.js";
import { kycs } from "../db/schema/kycs.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const SORTABLE_COLUMNS = {
  name: customers.first_name,
  surname: customers.surname,
  date_created: customers.date_created,
  status: customers.status,
  country: customers.country_name,
  type: customers.type,
};

function buildOrderBy(sortBy, order) {
  const column = SORTABLE_COLUMNS[sortBy] || customers.date_created;
  return order === "asc" ? asc(column) : desc(column);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfLastMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

async function enrichWithWalletsAndKyc(rows) {
  if (rows.length === 0) return rows;

  const identifiers = rows.map((r) => r.identifier);

  const [walletCounts, kycStatuses] = await Promise.all([
    db.execute(
      sql`SELECT identifier, COUNT(*) as wallet_count, GROUP_CONCAT(DISTINCT currency_code) as currencies FROM CustomerWallets WHERE identifier IN (${sql.join(identifiers.map((id) => sql`${id}`), sql`,`)}) GROUP BY identifier`,
    ),
    db.execute(
      sql`SELECT identifier, CASE WHEN SUM(CASE WHEN is_compliant = 'Y' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN is_compliant != 'Y' THEN 1 ELSE 0 END) = 0 THEN 'verified' WHEN COUNT(*) = 0 THEN 'none' WHEN SUM(CASE WHEN is_compliant != 'Y' THEN 1 ELSE 0 END) > 0 THEN 'pending' ELSE 'pending' END as kyc_status, COUNT(*) as kyc_count FROM KYCs WHERE identifier IN (${sql.join(identifiers.map((id) => sql`${id}`), sql`,`)}) GROUP BY identifier`,
    ),
  ]);

  const walletRows = Array.isArray(walletCounts[0]) ? walletCounts[0] : walletCounts;
  const kycRows = Array.isArray(kycStatuses[0]) ? kycStatuses[0] : kycStatuses;

  const walletMap = new Map();
  for (const w of walletRows) {
    walletMap.set(w.identifier, {
      wallet_count: Number(w.wallet_count),
      currencies: w.currencies ? w.currencies.split(",") : [],
    });
  }

  const kycMap = new Map();
  for (const k of kycRows) {
    kycMap.set(k.identifier, k.kyc_status);
  }

  return rows.map((row) => ({
    ...row,
    wallet_count: walletMap.get(row.identifier)?.wallet_count ?? 0,
    currencies: walletMap.get(row.identifier)?.currencies ?? [],
    kyc_status: kycMap.get(row.identifier) ?? "none",
  }));
}

export default class CustomerService {
  async getAll({ limit, offset, filters, sortBy, order }) {
    const conditions = [];
    if (filters.status) conditions.push(eq(customers.status, filters.status));
    if (filters.account_key) conditions.push(eq(customers.account_key, filters.account_key));
    if (filters.environment) conditions.push(eq(customers.environment, filters.environment));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderClause = buildOrderBy(sortBy, order);

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customers).where(where).limit(limit).offset(offset).orderBy(orderClause),
      db.select({ total: count() }).from(customers).where(where),
    ]);

    const enriched = await enrichWithWalletsAndKyc(rows);

    return { count: Number(total), rows: enriched };
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

    const enriched = await enrichWithWalletsAndKyc([customer]);
    return enriched[0];
  }

  async getByMerchant(accountKey, { limit, offset, sortBy, order }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(customers.account_key, accountKey);
    const orderClause = buildOrderBy(sortBy, order);

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(customers).where(where).limit(limit).offset(offset).orderBy(orderClause),
      db.select({ total: count() }).from(customers).where(where),
    ]);

    const enriched = await enrichWithWalletsAndKyc(rows);

    return { count: Number(total), rows: enriched };
  }

  async getStats() {
    const thisMonth = startOfMonth();
    const lastMonth = startOfLastMonth();

    const [
      [{ total: totalAll }],
      [{ total: totalActive }],
      [{ total: totalRestricted }],
      [{ total: kycPending }],
      [{ total: newThisMonth }],
      [{ total: newLastMonth }],
      [{ total: activeThisMonth }],
      [{ total: activeLastMonth }],
      [{ total: restrictedThisMonth }],
      [{ total: restrictedLastMonth }],
      [{ total: kycPendingThisMonth }],
      [{ total: kycPendingLastMonth }],
    ] = await Promise.all([
      db.select({ total: count() }).from(customers),
      db.select({ total: count() }).from(customers).where(eq(customers.status, "ACTIVE")),
      db.select({ total: count() }).from(customers)
        .where(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y"))),
      db.select({ total: count() }).from(kycs).where(ne(kycs.is_compliant, "Y")),

      db.select({ total: count() }).from(customers).where(gte(customers.date_created, thisMonth)),
      db.select({ total: count() }).from(customers)
        .where(and(gte(customers.date_created, lastMonth), lt(customers.date_created, thisMonth))),

      db.select({ total: count() }).from(customers)
        .where(and(eq(customers.status, "ACTIVE"), gte(customers.date_created, thisMonth))),
      db.select({ total: count() }).from(customers)
        .where(and(eq(customers.status, "ACTIVE"), gte(customers.date_created, lastMonth), lt(customers.date_created, thisMonth))),

      db.select({ total: count() }).from(customers)
        .where(and(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y")), gte(customers.date_created, thisMonth))),
      db.select({ total: count() }).from(customers)
        .where(and(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y")), gte(customers.date_created, lastMonth), lt(customers.date_created, thisMonth))),

      db.select({ total: count() }).from(kycs)
        .where(and(ne(kycs.is_compliant, "Y"), gte(kycs.date_created, thisMonth))),
      db.select({ total: count() }).from(kycs)
        .where(and(ne(kycs.is_compliant, "Y"), gte(kycs.date_created, lastMonth), lt(kycs.date_created, thisMonth))),
    ]);

    function pctChange(current, previous) {
      const cur = Number(current);
      const prev = Number(previous);
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }

    return {
      total: {
        count: Number(totalAll),
        new_this_month: Number(newThisMonth),
        new_last_month: Number(newLastMonth),
        change_pct: pctChange(newThisMonth, newLastMonth),
      },
      active: {
        count: Number(totalActive),
        new_this_month: Number(activeThisMonth),
        new_last_month: Number(activeLastMonth),
        change_pct: pctChange(activeThisMonth, activeLastMonth),
      },
      kyc_pending: {
        count: Number(kycPending),
        new_this_month: Number(kycPendingThisMonth),
        new_last_month: Number(kycPendingLastMonth),
        change_pct: pctChange(kycPendingThisMonth, kycPendingLastMonth),
      },
      restricted: {
        count: Number(totalRestricted),
        new_this_month: Number(restrictedThisMonth),
        new_last_month: Number(restrictedLastMonth),
        change_pct: pctChange(restrictedThisMonth, restrictedLastMonth),
      },
    };
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
