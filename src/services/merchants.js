import { eq, and, desc, asc, count, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants, merchantLedgers, settlementLedgers } from "../db/schema/merchants.js";
import { customers } from "../db/schema/customers.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const SORTABLE_COLUMNS = {
  name: merchants.name,
  trade_name: merchants.trade_name,
  date_created: merchants.date_created,
};

function buildOrderBy(sortBy, order) {
  const column = SORTABLE_COLUMNS[sortBy] || merchants.date_created;
  return order === "asc" ? asc(column) : desc(column);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfLastMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

async function enrichWithCounts(rows) {
  if (rows.length === 0) return rows;

  const accountKeys = rows.map((r) => r.account_key);

  const [customerCounts, ledgerCounts, settlementCounts] = await Promise.all([
    db.execute(
      sql`SELECT account_key, COUNT(*) as customer_count FROM Customers WHERE account_key IN (${sql.join(accountKeys.map((k) => sql`${k}`), sql`,`)}) GROUP BY account_key`,
    ),
    db.execute(
      sql`SELECT account_key, COUNT(*) as ledger_count, GROUP_CONCAT(DISTINCT currency_code) as currencies FROM MerchantLedgers WHERE account_key IN (${sql.join(accountKeys.map((k) => sql`${k}`), sql`,`)}) GROUP BY account_key`,
    ),
    db.execute(
      sql`SELECT account_key, COUNT(*) as settlement_count FROM SettlementLedgers WHERE account_key IN (${sql.join(accountKeys.map((k) => sql`${k}`), sql`,`)}) GROUP BY account_key`,
    ),
  ]);

  const custRows = Array.isArray(customerCounts[0]) ? customerCounts[0] : customerCounts;
  const ledgRows = Array.isArray(ledgerCounts[0]) ? ledgerCounts[0] : ledgerCounts;
  const settRows = Array.isArray(settlementCounts[0]) ? settlementCounts[0] : settlementCounts;

  const custMap = new Map();
  for (const c of custRows) custMap.set(c.account_key, Number(c.customer_count));

  const ledgMap = new Map();
  for (const l of ledgRows) {
    ledgMap.set(l.account_key, {
      ledger_count: Number(l.ledger_count),
      currencies: l.currencies ? l.currencies.split(",") : [],
    });
  }

  const settMap = new Map();
  for (const s of settRows) settMap.set(s.account_key, Number(s.settlement_count));

  return rows.map((row) => ({
    ...row,
    customer_count: custMap.get(row.account_key) ?? 0,
    ledger_count: ledgMap.get(row.account_key)?.ledger_count ?? 0,
    currencies: ledgMap.get(row.account_key)?.currencies ?? [],
    settlement_count: settMap.get(row.account_key) ?? 0,
  }));
}

export default class MerchantService {
  async getAll({ limit, offset, filters, sortBy, order }) {
    const conditions = [];
    if (filters.name) conditions.push(sql`${merchants.name} LIKE ${`%${filters.name}%`}`);
    if (filters.trade_name) conditions.push(sql`${merchants.trade_name} LIKE ${`%${filters.trade_name}%`}`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderClause = buildOrderBy(sortBy, order);

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(merchants).where(where).limit(limit).offset(offset).orderBy(orderClause),
      db.select({ total: count() }).from(merchants).where(where),
    ]);

    const enriched = await enrichWithCounts(rows);

    return { count: Number(total), rows: enriched };
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

    const enriched = await enrichWithCounts([merchant]);
    return enriched[0];
  }

  async getStats() {
    const thisMonth = startOfMonth();
    const lastMonth = startOfLastMonth();

    const [
      [{ total: totalAll }],
      [{ total: totalCustomers }],
      [{ total: totalLedgers }],
      [{ total: totalSettlements }],
      [{ total: newThisMonth }],
      [{ total: newLastMonth }],
    ] = await Promise.all([
      db.select({ total: count() }).from(merchants),
      db.select({ total: count() }).from(customers),
      db.select({ total: count() }).from(merchantLedgers),
      db.select({ total: count() }).from(settlementLedgers),
      db.select({ total: count() }).from(merchants).where(gte(merchants.date_created, thisMonth)),
      db.select({ total: count() }).from(merchants)
        .where(and(gte(merchants.date_created, lastMonth), lt(merchants.date_created, thisMonth))),
    ]);

    function pctChange(current, previous) {
      const cur = Number(current);
      const prev = Number(previous);
      if (prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 100);
    }

    return {
      total_merchants: {
        count: Number(totalAll),
        new_this_month: Number(newThisMonth),
        new_last_month: Number(newLastMonth),
        change_pct: pctChange(newThisMonth, newLastMonth),
      },
      total_customers: Number(totalCustomers),
      total_ledgers: Number(totalLedgers),
      total_settlements: Number(totalSettlements),
    };
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
