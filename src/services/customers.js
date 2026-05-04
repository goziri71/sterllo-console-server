import { eq, and, ne, or, desc, asc, count, sql, gte, lt, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { merchants } from "../db/schema/merchants.js";
import { kycs } from "../db/schema/kycs.js";
import { transactionDisputes } from "../db/schema/disputes.js";
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

const CUSTOMER_PATCH_FIELDS = [
  "status",
  "is_pnd",
  "is_pnc",
  "is_personal_compliant",
  "is_business_compliant",
  "tier",
];

const ALLOWED_STATUS = new Set(["PENDING", "ACTIVE", "FAILED", "REJECTED"]);
const ALLOWED_TIERS = new Set([1, 2, 3]);

/** Normalize boolean-ish flags to Y/N (accepts Y/N and 1/0). */
function normalizeYN(value, fieldName, errorCode) {
  if (value === undefined) return undefined;
  const s = String(value).trim().toUpperCase();
  if (s === "Y" || s === "1" || s === "TRUE") return "Y";
  if (s === "N" || s === "0" || s === "FALSE") return "N";
  throw new ErrorClass(`${fieldName} must be Y or N`, errorCode);
}

/**
 * Shared validation for JWT and header-based customer updates.
 * @param {object} data - Raw request body
 * @param {number} errorCode - ErrorClass code (400 for console JWT, 4000 for header clients)
 */
function normalizeCustomerPatchData(data, errorCode = 400) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ErrorClass("Invalid request body", errorCode);
  }

  const updateData = {};
  for (const field of CUSTOMER_PATCH_FIELDS) {
    if (data[field] === undefined) continue;

    if (field === "tier") {
      const n = Number(data[field]);
      if (!Number.isInteger(n) || !ALLOWED_TIERS.has(n)) {
        throw new ErrorClass("tier must be 1, 2, or 3", errorCode);
      }
      updateData[field] = n;
      continue;
    }

    if (field === "status") {
      const normalizedStatus = String(data[field]).trim().toUpperCase();
      if (!ALLOWED_STATUS.has(normalizedStatus)) {
        throw new ErrorClass("status must be one of: PENDING, ACTIVE, FAILED, REJECTED", errorCode);
      }
      updateData[field] = normalizedStatus;
      continue;
    }

    updateData[field] = normalizeYN(data[field], field, errorCode);
  }

  if (Object.keys(updateData).length === 0) {
    throw new ErrorClass("No valid fields to update", errorCode);
  }

  return updateData;
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

  const [walletCurrencies, kycStatuses] = await Promise.all([
    db.execute(
      sql`SELECT identifier, GROUP_CONCAT(DISTINCT currency_code) as currencies FROM CustomerWallets WHERE identifier IN (${sql.join(identifiers.map((id) => sql`${id}`), sql`,`)}) GROUP BY identifier`,
    ),
    db.execute(
      sql`SELECT identifier, CASE WHEN SUM(CASE WHEN is_compliant = 'Y' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN is_compliant != 'Y' THEN 1 ELSE 0 END) = 0 THEN 'verified' WHEN COUNT(*) = 0 THEN 'none' WHEN SUM(CASE WHEN is_compliant != 'Y' THEN 1 ELSE 0 END) > 0 THEN 'pending' ELSE 'pending' END as kyc_status, COUNT(*) as kyc_count FROM KYCs WHERE identifier IN (${sql.join(identifiers.map((id) => sql`${id}`), sql`,`)}) GROUP BY identifier`,
    ),
  ]);

  const walletRows = Array.isArray(walletCurrencies[0]) ? walletCurrencies[0] : walletCurrencies;
  const kycRows = Array.isArray(kycStatuses[0]) ? kycStatuses[0] : kycStatuses;

  const currencyMap = new Map();
  for (const w of walletRows) {
    currencyMap.set(w.identifier, w.currencies ? w.currencies.split(",") : []);
  }

  const kycMap = new Map();
  for (const k of kycRows) {
    kycMap.set(k.identifier, k.kyc_status);
  }

  return rows.map((row) => ({
    ...row,
    currencies: currencyMap.get(row.identifier) ?? [],
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

  async ensureCustomerBelongsToMerchant(identifier, accountKey) {
    const [row] = await db
      .select({ account_key: customers.account_key })
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);
    if (!row) {
      throw new ErrorClass("Customer not found", 404);
    }
    if (row.account_key !== accountKey) {
      throw new ErrorClass("Customer does not belong to this merchant", 400);
    }
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

    const updateData = normalizeCustomerPatchData(data, 400);

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

  /** Sets customer KYC tier (1–3). Delegates to `update`. */
  async setTier(identifier, tier) {
    if (tier === undefined) {
      throw new ErrorClass("tier is required", 400);
    }
    return this.update(identifier, { tier });
  }

  /**
   * Updates posting restrictions (`is_pnd` / `is_pnc`). At least one field required.
   */
  async setRestrictions(identifier, body) {
    const { is_pnd: pnd, is_pnc: pnc } = body || {};
    if (pnd === undefined && pnc === undefined) {
      throw new ErrorClass("At least one of is_pnd, is_pnc is required", 400);
    }
    const payload = {};
    if (pnd !== undefined) payload.is_pnd = pnd;
    if (pnc !== undefined) payload.is_pnc = pnc;
    return this.update(identifier, payload);
  }

  /**
   * Freeze-style restrictions: `full` (debit + credit block), `debit_only` (PND), `credit_only` (PNC).
   */
  async freeze(identifier, { scope = "full" } = {}) {
    const map = {
      full: { is_pnd: "Y", is_pnc: "Y" },
      debit_only: { is_pnd: "Y", is_pnc: "N" },
      credit_only: { is_pnd: "N", is_pnc: "Y" },
    };
    const payload = map[scope];
    if (!payload) {
      throw new ErrorClass("scope must be one of: full, debit_only, credit_only", 400);
    }
    return this.update(identifier, payload);
  }

  /** Clears both PND and PNC (typical unfreeze). */
  async unfreeze(identifier) {
    return this.update(identifier, { is_pnd: "N", is_pnc: "N" });
  }

  async updateByUserAndAccountHeaders({ userKey, accountKey, reference, data }) {
    const u = String(userKey || "").trim();
    const a = String(accountKey || "").trim();
    const r = String(reference ?? data?.reference ?? "").trim();
    if (!u || !a) {
      throw new ErrorClass("x-user-key and x-account-key headers are required", 400);
    }
    if (!r) {
      throw new ErrorClass("reference is required", 4000);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ErrorClass("Invalid request body", 4000);
    }

    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.user_key, u),
          eq(customers.account_key, a),
          eq(customers.reference, r),
        ),
      )
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 4004);
    }

    const updateData = normalizeCustomerPatchData(data, 4000);

    updateData.date_modified = new Date();
    await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, customer.id));

    const [updated] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.id))
      .limit(1);

    return updated;
  }

  async getByUserAccountHeadersPaginated({ userKey, accountKey, reference, limit, offset }) {
    const u = String(userKey || "").trim();
    const a = String(accountKey || "").trim();
    if (!u || !a) {
      throw new ErrorClass("x-user-key and x-account-key headers are required", 4000);
    }

    const conditions = [eq(customers.user_key, u), eq(customers.account_key, a)];
    const r = String(reference || "").trim();
    if (r) {
      conditions.push(eq(customers.reference, r));
    }
    const where = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(customers)
        .where(where)
        .orderBy(desc(customers.date_created))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(customers).where(where),
    ]);

    return { count: Number(total), rows };
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

  async getCustomerViewMetrics(identifier) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const walletRows = await db
      .select({ wallet_key: customerWallets.wallet_key })
      .from(customerWallets)
      .where(eq(customerWallets.identifier, identifier));
    const walletKeys = walletRows.map((w) => w.wallet_key).filter(Boolean);

    const [{ total: subAccounts }] = await db
      .select({ total: count() })
      .from(customers)
      .where(eq(customers.parent_identifier, identifier));

    let disputeCount = 0;
    if (walletKeys.length > 0) {
      const [{ c }] = await db
        .select({ c: count() })
        .from(transactionDisputes)
        .where(inArray(transactionDisputes.transaction_wallet_key, walletKeys));
      disputeCount = Number(c || 0);
    }

    return {
      total_wallets: walletKeys.length,
      sub_accounts: Number(subAccounts || 0),
      disputes: disputeCount,
    };
  }
}
