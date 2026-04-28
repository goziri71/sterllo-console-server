import { eq, and, desc, asc, count, ne, or, sql } from "drizzle-orm";
import axios from "axios";
import { db } from "../db/index.js";
import { getSterlloSourceConfig, getSterlloSourcePool } from "../db/sterlloSourceDb.js";
import { merchants, merchantLedgers, settlementLedgers } from "../db/schema/merchants.js";
import { customers } from "../db/schema/customers.js";
import { kycs } from "../db/schema/kycs.js";
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

/** Normalize combined environment strings to response `type`: "baas" | "saas" | null */
function merchantTypeFromEnvironments(environmentsCsv) {
  if (!environmentsCsv || typeof environmentsCsv !== "string") return null;
  const parts = [
    ...new Set(
      environmentsCsv
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.includes("baas")) return "baas";
  if (parts.includes("saas")) return "saas";
  return parts[0];
}

function mergeMerchantEnvironments(ledgerEnvsCsv, customerEnvsCsv) {
  const merged = [ledgerEnvsCsv, customerEnvsCsv].filter(Boolean).join(",");
  return merchantTypeFromEnvironments(merged || null);
}

async function enrichWithCounts(rows) {
  if (rows.length === 0) return rows;

  const accountKeys = rows.map((r) => r.account_key);
  const accountKeyList = sql.join(accountKeys.map((k) => sql`${k}`), sql`,`);

  const [ledgerCounts, settlementCounts, customerEnvCounts] = await Promise.all([
    db.execute(
      sql`SELECT account_key, COUNT(*) as ledger_count, GROUP_CONCAT(DISTINCT currency_code) as currencies, GROUP_CONCAT(DISTINCT NULLIF(TRIM(LOWER(environment)), '')) as environments FROM MerchantLedgers WHERE account_key IN (${accountKeyList}) GROUP BY account_key`,
    ),
    db.execute(
      sql`SELECT account_key, COUNT(*) as settlement_count FROM SettlementLedgers WHERE account_key IN (${accountKeyList}) GROUP BY account_key`,
    ),
    db.execute(sql`
      SELECT account_key, GROUP_CONCAT(DISTINCT env) AS environments
      FROM (
        SELECT account_key, NULLIF(TRIM(LOWER(environment)), '') AS env
        FROM Customers
        WHERE account_key IN (${accountKeyList})
        UNION ALL
        SELECT c.account_key, NULLIF(TRIM(LOWER(cw.environment)), '') AS env
        FROM Customers c
        INNER JOIN CustomerWallets cw ON cw.identifier = c.identifier
        WHERE c.account_key IN (${accountKeyList})
      ) x
      WHERE env IS NOT NULL AND env <> ''
      GROUP BY account_key
    `),
  ]);

  const ledgRows = Array.isArray(ledgerCounts[0]) ? ledgerCounts[0] : ledgerCounts;
  const settRows = Array.isArray(settlementCounts[0]) ? settlementCounts[0] : settlementCounts;
  const custEnvRows = Array.isArray(customerEnvCounts[0]) ? customerEnvCounts[0] : customerEnvCounts;

  const ledgMap = new Map();
  for (const l of ledgRows) {
    ledgMap.set(l.account_key, {
      ledger_count: Number(l.ledger_count),
      currencies: l.currencies ? l.currencies.split(",") : [],
      environments: l.environments,
    });
  }

  const custEnvMap = new Map();
  for (const e of custEnvRows) custEnvMap.set(e.account_key, e.environments);

  const settMap = new Map();
  for (const s of settRows) settMap.set(s.account_key, Number(s.settlement_count));

  return rows.map((row) => {
    const ledgerPart = ledgMap.get(row.account_key);
    const type = mergeMerchantEnvironments(ledgerPart?.environments, custEnvMap.get(row.account_key));
    return {
      ...row,
      ledger_count: ledgerPart?.ledger_count ?? 0,
      currencies: ledgerPart?.currencies ?? [],
      type,
      settlement_count: settMap.get(row.account_key) ?? 0,
    };
  });
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
    const [
      [{ total: totalMerchants }],
      [{ total: totalCustomers }],
      [{ total: kycPending }],
      [{ total: restrictedAccounts }],
    ] = await Promise.all([
      db.select({ total: count() }).from(merchants),
      db.select({ total: count() }).from(customers),
      db.select({ total: count() }).from(kycs).where(ne(kycs.is_compliant, "Y")),
      db
        .select({ total: count() })
        .from(customers)
        .where(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y"))),
    ]);

    return {
      total_merchants: Number(totalMerchants),
      total_customers: Number(totalCustomers),
      kyc_pending: Number(kycPending),
      restricted_accounts: Number(restrictedAccounts),
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

  async linkBeamerAccount(accountKey, payload) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const sourceConfig = getSterlloSourceConfig();
    if (!String(sourceConfig.targetProductKey || "").trim()) {
      throw new ErrorClass("TARGET_PRODUCT_KEY is required for beamer link", 500);
    }
    if (!String(sourceConfig.sourceProductKey || "").trim()) {
      throw new ErrorClass("SOURCE_PRODUCT_KEY is required for beamer link", 500);
    }
    const headers = payload?.headers;
    const data = payload?.data;
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
      throw new ErrorClass("headers object is required", 400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ErrorClass("data object is required", 400);
    }

    const requiredHeaders = ["User-Key", "Accout-Key", "Request-Id"];
    for (const key of requiredHeaders) {
      if (!String(headers[key] || "").trim()) {
        throw new ErrorClass(`${key} header is required`, 400);
      }
    }

    if (!String(data.account_number || "").trim()) {
      throw new ErrorClass("data.account_number is required", 400);
    }
    if (!data.client || typeof data.client !== "object" || Array.isArray(data.client)) {
      throw new ErrorClass("data.client object is required", 400);
    }
    if (!String(data.client.id || "").trim()) {
      throw new ErrorClass("data.client.id is required", 400);
    }
    if (!String(data.client.key || "").trim()) {
      throw new ErrorClass("data.client.key is required", 400);
    }

    const outboundHeaders = {
      "Target-Product-Key": sourceConfig.targetProductKey,
      "Source-Product-Key": sourceConfig.sourceProductKey,
      "User-Key": String(headers["User-Key"]).trim(),
      "Accout-Key": String(headers["Accout-Key"]).trim(),
      "Request-Id": String(headers["Request-Id"]).trim(),
    };
    if (headers["Request-IP-Address"] !== undefined && headers["Request-IP-Address"] !== null) {
      outboundHeaders["Request-IP-Address"] = String(headers["Request-IP-Address"]).trim();
    }

    try {
      const response = await axios.post(
        "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Link",
        data,
        { headers: outboundHeaders },
      );
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Unable to link account with Beamer integration";
      throw new ErrorClass(message, status >= 400 && status < 600 ? status : 502);
    }
  }

  async getSterlloUsersForBeamerLink({ limit, offset }) {
    try {
      const sourceConfig = getSterlloSourceConfig();
      const sourcePool = getSterlloSourcePool();

      const productId = String(sourceConfig.sterlloProductId || "").trim();
      if (!productId) {
        throw new ErrorClass("STERLLO_PRODUCT_ID is required", 400);
      }

      const [rows] = await sourcePool.query(
        `
          SELECT
            id,
            user_key,
            account_key,
            name,
            trade_name,
            email_address,
            phone_number,
            product_id,
            date_created
          FROM __accounts
          WHERE product_id = ?
          ORDER BY date_created DESC
          LIMIT ?
          OFFSET ?
        `,
        [productId, Number(limit), Number(offset)],
      );

      const [countRows] = await sourcePool.query(
        `
          SELECT COUNT(*) AS total
          FROM __accounts
          WHERE product_id = ?
        `,
        [productId],
      );

      return {
        count: Number(countRows?.[0]?.total || 0),
        rows: Array.isArray(rows) ? rows : [],
      };
    } catch (error) {
      if (error instanceof ErrorClass) {
        throw error;
      }
      throw new ErrorClass(
        `Unable to fetch Sterllo users from source DB (${error?.code || "UNKNOWN_ERROR"})`,
        424,
      );
    }
  }

  async updateBeamerAccount(accountKey, payload) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const sourceConfig = getSterlloSourceConfig();
    if (!String(sourceConfig.targetProductKey || "").trim()) {
      throw new ErrorClass("TARGET_PRODUCT_KEY is required for beamer update", 500);
    }
    if (!String(sourceConfig.sourceProductKey || "").trim()) {
      throw new ErrorClass("SOURCE_PRODUCT_KEY is required for beamer update", 500);
    }
    const headers = payload?.headers;
    const data = payload?.data;
    if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
      throw new ErrorClass("headers object is required", 400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ErrorClass("data object is required", 400);
    }
    if (!String(headers["Request-Id"] || "").trim()) {
      throw new ErrorClass("Request-Id header is required", 400);
    }

    if (!String(data.id || "").trim()) {
      throw new ErrorClass("data.id is required", 400);
    }
    if (!String(data.account_number || "").trim()) {
      throw new ErrorClass("data.account_number is required", 400);
    }
    if (!data.client || typeof data.client !== "object" || Array.isArray(data.client)) {
      throw new ErrorClass("data.client object is required", 400);
    }
    if (!String(data.client.id || "").trim()) {
      throw new ErrorClass("data.client.id is required", 400);
    }
    if (!String(data.client.key || "").trim()) {
      throw new ErrorClass("data.client.key is required", 400);
    }

    const outboundHeaders = {
      "Target-Product-Key": sourceConfig.targetProductKey,
      "Source-Product-Key": sourceConfig.sourceProductKey,
      "Request-Id": String(headers["Request-Id"]).trim(),
    };

    try {
      const response = await axios.post(
        "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Update",
        data,
        { headers: outboundHeaders },
      );
      return response.data;
    } catch (error) {
      const status = error?.response?.status;
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Unable to update account with Beamer integration";
      throw new ErrorClass(message, status >= 400 && status < 600 ? status : 502);
    }
  }
}
