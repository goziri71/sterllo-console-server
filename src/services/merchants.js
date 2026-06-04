import crypto from "crypto";
import { eq, and, desc, asc, count, ne, or, sql, max, inArray } from "drizzle-orm";
import axios from "axios";
import { db } from "../db/index.js";
import { merchants, merchantLedgers, settlementLedgers } from "../db/schema/merchants.js";
import { udara360APICredentials } from "../db/schema/vendor.js";
import {
  decryptFromPlainPair,
  looksLikeBase64,
  stripWrappingQuotes,
} from "../utils/decryptProdSecret.js";
import { customers } from "../db/schema/customers.js";
import { kycs } from "../db/schema/kycs.js";
import { ErrorClass, IsvsPassthroughError } from "../utils/errorClass/index.js";
import { isMissingMysqlTableError } from "../utils/mysqlErrors.js";

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

function getBeamerProductKeyMaterial() {
  return {
    sourceProductKey: stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY || ""),
    targetProductKey: stripWrappingQuotes(process.env.TARGET_PRODUCT_KEY || ""),
    sourceProductKeyKeychain: stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY_KEYCHAIN || ""),
    targetProductKeyKeychain: stripWrappingQuotes(process.env.TARGET_PRODUCT_KEY_KEYCHAIN || ""),
  };
}

function beamerDecryptKeychains(material = {}, productKeys = {}) {
  return [
    material.sourceProductKeyKeychain,
    material.targetProductKeyKeychain,
    productKeys.sourceProductKey,
    productKeys.targetProductKey,
  ].filter((value) => String(value || "").trim().length >= 32);
}

/** Env product keys: decrypt ciphertext with its own *_KEYCHAIN only (not cross-keychain). */
function decryptBeamerEnvProductKey(encrypted, keychain, label) {
  const enc = stripWrappingQuotes(String(encrypted ?? "").trim());
  if (!enc) return "";
  const kc = stripWrappingQuotes(String(keychain ?? "").trim());
  if (!kc) return enc;
  try {
    return stripWrappingQuotes(decryptFromPlainPair(enc, kc, { valueName: label }));
  } catch {
    return enc;
  }
}

function resolveBeamerProductKeysFromMaterial(material) {
  return {
    sourceProductKey: decryptBeamerEnvProductKey(
      material.sourceProductKey,
      material.sourceProductKeyKeychain,
      "SOURCE_PRODUCT_KEY",
    ),
    targetProductKey: decryptBeamerEnvProductKey(
      material.targetProductKey,
      material.targetProductKeyKeychain,
      "TARGET_PRODUCT_KEY",
    ),
  };
}

/** User-Key / Accout-Key / Request-Id: decrypt when sent as AES/base64; else use plaintext. */
function decryptBeamerRequestHeader(raw, material, productKeys, label) {
  const text = stripWrappingQuotes(String(raw ?? "").trim());
  if (!text) return "";

  const keychains = beamerDecryptKeychains(material, productKeys);
  for (const keychain of keychains) {
    try {
      const plain = decryptFromPlainPair(text, keychain, { valueName: label });
      const result = stripWrappingQuotes(String(plain).trim());
      if (result) return result;
    } catch {
      /* try next keychain */
    }
  }

  if (/^[0-9a-f-]{32,36}$/i.test(text)) return text;
  if (text.length <= 36 && !looksLikeBase64(text)) return text;

  if (looksLikeBase64(text)) {
    throw new ErrorClass(`Unable to decrypt ${label} for ISVS Beamer request`, 400, {
      hint: "Provide AES-encrypted base64 or plaintext value decryptable with SOURCE/TARGET product key keychains",
    });
  }

  return text;
}

function buildBeamerOutboundHeaders(material, headers, { link = false } = {}) {
  const productKeys = resolveBeamerProductKeysFromMaterial(material);
  const outbound = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "Request-Id": decryptBeamerRequestHeader(
      headers["Request-Id"],
      material,
      productKeys,
      "Request-Id",
    ),
  };

  if (link) {
    outbound["User-Key"] = decryptBeamerRequestHeader(
      headers["User-Key"],
      material,
      productKeys,
      "User-Key",
    );
    outbound["Accout-Key"] = decryptBeamerRequestHeader(
      headers["Accout-Key"],
      material,
      productKeys,
      "Accout-Key",
    );
    if (headers["Request-IP-Address"]) {
      outbound["Request-IP-Address"] = decryptBeamerRequestHeader(
        headers["Request-IP-Address"],
        material,
        productKeys,
        "Request-IP-Address",
      );
    }
  }

  return outbound;
}

function getBeamerProductKeys() {
  const material = getBeamerProductKeyMaterial();
  const productKeys = resolveBeamerProductKeysFromMaterial(material);
  return { ...material, ...productKeys };
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function pickFirstNonEmpty(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return "";
}

function getHttpHeader(httpHeaders, ...names) {
  if (!httpHeaders || typeof httpHeaders !== "object") return "";
  for (const name of names) {
    const direct = httpHeaders[name];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const lower = httpHeaders[name.toLowerCase()];
    if (lower != null && String(lower).trim()) return String(lower).trim();
  }
  return "";
}

function normalizeBeamerLinkPayload(payload, httpHeaders, merchant, udara360) {
  const body = asPlainObject(payload) || {};
  const nestedHeaders = asPlainObject(body.headers) || asPlainObject(body.header);
  const nestedData = asPlainObject(body.data);
  const flatClient = asPlainObject(body.client);

  const headers = {
    "User-Key": pickFirstNonEmpty(
      nestedHeaders?.["User-Key"],
      nestedHeaders?.user_key,
      nestedHeaders?.userKey,
      body.user_key,
      body.userKey,
      getHttpHeader(httpHeaders, "User-Key", "user-key"),
      merchant?.user_key,
    ),
    "Accout-Key": pickFirstNonEmpty(
      nestedHeaders?.["Accout-Key"],
      nestedHeaders?.["Account-Key"],
      nestedHeaders?.account_key,
      nestedHeaders?.accountKey,
      body.account_key,
      body.accountKey,
      getHttpHeader(httpHeaders, "Accout-Key", "Account-Key", "accout-key", "account-key"),
      merchant?.account_key,
    ),
    "Request-Id": pickFirstNonEmpty(
      nestedHeaders?.["Request-Id"],
      nestedHeaders?.request_id,
      nestedHeaders?.requestId,
      body.request_id,
      body.requestId,
      getHttpHeader(httpHeaders, "Request-Id", "request-id"),
      crypto.randomUUID(),
    ),
  };

  const requestIp = pickFirstNonEmpty(
    nestedHeaders?.["Request-IP-Address"],
    nestedHeaders?.request_ip_address,
    body.request_ip_address,
    getHttpHeader(httpHeaders, "Request-IP-Address", "request-ip-address"),
  );
  if (requestIp) headers["Request-IP-Address"] = requestIp;

  const data = {
    account_number: pickFirstNonEmpty(
      nestedData?.account_number,
      body.account_number,
      body.accountNumber,
      udara360?.account_number,
    ),
    client: {
      id: pickFirstNonEmpty(
        nestedData?.client?.id,
        flatClient?.id,
        body.client_id,
        body.clientId,
        udara360?.client_id,
      ),
      key: pickFirstNonEmpty(
        nestedData?.client?.key,
        flatClient?.key,
        body.client_key,
        body.clientKey,
      ),
    },
  };

  return { headers, data };
}

function normalizeBeamerUpdatePayload(payload, httpHeaders, udara360) {
  const body = asPlainObject(payload) || {};
  const nestedHeaders = asPlainObject(body.headers) || asPlainObject(body.header);
  const nestedData = asPlainObject(body.data);
  const flatClient = asPlainObject(body.client);

  const headers = {
    "Request-Id": pickFirstNonEmpty(
      nestedHeaders?.["Request-Id"],
      nestedHeaders?.request_id,
      nestedHeaders?.requestId,
      body.request_id,
      body.requestId,
      getHttpHeader(httpHeaders, "Request-Id", "request-id"),
      crypto.randomUUID(),
    ),
  };

  const data = {
    id: pickFirstNonEmpty(
      nestedData?.id,
      body.id,
      body.integration_id,
      body.integrationId,
      udara360?.identifier,
      udara360?.id != null ? String(udara360.id) : "",
    ),
    account_number: pickFirstNonEmpty(
      nestedData?.account_number,
      body.account_number,
      body.accountNumber,
      udara360?.account_number,
    ),
    client: {
      id: pickFirstNonEmpty(
        nestedData?.client?.id,
        flatClient?.id,
        body.client_id,
        body.clientId,
        udara360?.client_id,
      ),
      key: pickFirstNonEmpty(
        nestedData?.client?.key,
        flatClient?.key,
        body.client_key,
        body.clientKey,
      ),
    },
  };

  return { headers, data };
}

function isvsPayloadMessage(payload) {
  if (payload == null) return null;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  return null;
}

function isIsvsBusinessSuccess(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (payload.state === false) return false;
  if (payload.state === true) return true;
  if (Number(payload.code) === 2000) return true;
  const inner = payload.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    if (inner.id != null && String(inner.id).trim()) return true;
  }
  return false;
}

function coerceIsvsPayload(raw) {
  if (raw == null) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function isvsEncryptedBlob(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.response === "string" && payload.response.trim()) return payload.response.trim();
  const inner = payload.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    if (typeof inner.response === "string" && inner.response.trim()) return inner.response.trim();
  }
  return null;
}

function parseDecryptedIsvsPlain(plain) {
  const trimmed = stripWrappingQuotes(String(plain ?? "").trim());
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* fall through */
  }
  return coerceIsvsPayload(trimmed);
}

function collectIsvsResponseDecryptAttempts(encrypted, keys = {}, outboundHeaders = {}, material = {}) {
  const attempts = [];
  const seen = new Set();
  const push = (enc, kc) => {
    const e = stripWrappingQuotes(String(enc ?? "").trim());
    const k = stripWrappingQuotes(String(kc ?? "").trim());
    if (!e || !k || k.length < 32) return;
    const id = `${e}|${k}`;
    if (seen.has(id)) return;
    seen.add(id);
    attempts.push([e, k]);
  };

  push(encrypted, keys.targetProductKeyKeychain);
  push(encrypted, keys.sourceProductKeyKeychain);
  push(encrypted, outboundHeaders["Target-Product-Key"]);
  push(encrypted, outboundHeaders["Source-Product-Key"]);
  push(encrypted, keys.targetProductKey);
  push(encrypted, keys.sourceProductKey);
  push(encrypted, material.targetProductKeyKeychain);
  push(encrypted, material.sourceProductKeyKeychain);
  push(material.targetProductKey, material.targetProductKeyKeychain);
  push(material.sourceProductKey, material.sourceProductKeyKeychain);
  push(material.targetProductKey, material.sourceProductKeyKeychain);
  push(material.sourceProductKey, material.targetProductKeyKeychain);

  return attempts;
}

function tryDecryptIsvsResponse(raw, productKeys = {}, outboundHeaders = {}) {
  const payload = coerceIsvsPayload(raw);
  const encrypted = isvsEncryptedBlob(payload);
  if (!encrypted) return payload;

  const material = getBeamerProductKeyMaterial();
  for (const [enc, keychain] of collectIsvsResponseDecryptAttempts(
    encrypted,
    productKeys,
    outboundHeaders,
    material,
  )) {
    try {
      const plain = decryptFromPlainPair(enc, keychain, { valueName: "ISVS response" });
      const parsed = parseDecryptedIsvsPlain(plain);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !isvsEncryptedBlob(parsed)) {
        return parsed;
      }
    } catch {
      /* try next keychain */
    }
  }

  return payload;
}

function isIsvsExplicitFailure(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (payload.state === false) return true;
  const code = Number(payload.code);
  return Number.isFinite(code) && code >= 4000 && code !== 2000;
}

function resolveIsvsHttpStatus(isvsBody, axiosStatus) {
  const code = Number(isvsBody?.code);
  if (Number.isFinite(code) && code >= 1000) {
    return Math.min(599, Math.max(100, Math.floor(code / 10)));
  }
  if (axiosStatus >= 400 && axiosStatus < 600) return axiosStatus;
  return 502;
}

function throwIsvsPassthrough(body, axiosStatus) {
  const payload = coerceIsvsPayload(body);
  const isvsBody =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : { state: false, message: String(payload ?? "") };
  throw new IsvsPassthroughError(isvsBody, resolveIsvsHttpStatus(isvsBody, axiosStatus));
}

function finalizeIsvsHttpBody(raw, productKeys = {}, outboundHeaders = {}) {
  const payload = coerceIsvsPayload(raw);
  const parsed = tryDecryptIsvsResponse(payload, productKeys, outboundHeaders);

  if (isvsEncryptedBlob(parsed)) {
    throw new ErrorClass(
      "ISVS returned an encrypted response body that could not be decrypted. Verify SOURCE_PRODUCT_KEY, TARGET_PRODUCT_KEY, and their KEYCHAIN env vars on the console server.",
      502,
    );
  }

  if (isIsvsExplicitFailure(parsed)) {
    throwIsvsPassthrough(parsed, 200);
  }

  if (isIsvsBusinessSuccess(parsed)) {
    return parsed;
  }

  if (isIsvsExplicitFailure(payload)) {
    throwIsvsPassthrough(payload, 200);
  }

  return parsed;
}

function throwIsvsAxiosError(error) {
  const status = error?.response?.status;
  const isvsBody = error?.response?.data ?? null;
  throwIsvsPassthrough(isvsBody, status);
}

const UDARA360_PUBLIC = {
  id: udara360APICredentials.id,
  identifier: udara360APICredentials.identifier,
  account_number: udara360APICredentials.account_number,
  auth_type: udara360APICredentials.auth_type,
  client_id: udara360APICredentials.client_id,
  expiry_date: udara360APICredentials.expiry_date,
  date_created: udara360APICredentials.date_created,
  date_modified: udara360APICredentials.date_modified,
  account_key: udara360APICredentials.account_key,
};

function shapeUdaraPublic(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    identifier: row.identifier,
    account_number: row.account_number,
    auth_type: row.auth_type,
    client_id: row.client_id,
    expiry_date: row.expiry_date,
    date_created: row.date_created,
    date_modified: row.date_modified,
  };
}

function isMissingUdaraTableError(e) {
  return isMissingMysqlTableError(e);
}

/** Latest credential row per account_key (for listing/detail); avoids fragile nested LEFT JOIN SQL. */
async function fetchLatestUdaraMap(accountKeys) {
  const map = new Map();
  const unique = [...new Set(accountKeys.filter(Boolean))];
  if (unique.length === 0) return map;

  try {
    const grouped = await db
      .select({
        account_key: udara360APICredentials.account_key,
        max_id: max(udara360APICredentials.id),
      })
      .from(udara360APICredentials)
      .where(inArray(udara360APICredentials.account_key, unique))
      .groupBy(udara360APICredentials.account_key);

    if (grouped.length === 0) return map;

    const ids = grouped.map((g) => g.max_id).filter((id) => id != null);
    if (ids.length === 0) return map;

    const detailRows = await db
      .select(UDARA360_PUBLIC)
      .from(udara360APICredentials)
      .where(inArray(udara360APICredentials.id, ids));

    for (const row of detailRows) {
      map.set(row.account_key, shapeUdaraPublic(row));
    }
    return map;
  } catch (e) {
    if (isMissingUdaraTableError(e)) return map;
    throw e;
  }
}

async function fetchLatestUdaraOne(accountKey) {
  try {
    const [row] = await db
      .select(UDARA360_PUBLIC)
      .from(udara360APICredentials)
      .where(eq(udara360APICredentials.account_key, accountKey))
      .orderBy(desc(udara360APICredentials.id))
      .limit(1);
    return shapeUdaraPublic(row);
  } catch (e) {
    if (isMissingUdaraTableError(e)) return null;
    throw e;
  }
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

    const [merchantRows, [{ total }]] = await Promise.all([
      db.select().from(merchants).where(where).limit(limit).offset(offset).orderBy(orderClause),
      db.select({ total: count() }).from(merchants).where(where),
    ]);

    const udaraMap = await fetchLatestUdaraMap(merchantRows.map((r) => r.account_key));
    const rows = merchantRows.map((r) => ({
      ...r,
      udara360: udaraMap.get(r.account_key) ?? null,
    }));
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

    const udara360 = await fetchLatestUdaraOne(accountKey);
    const enriched = await enrichWithCounts([{ ...merchant, udara360 }]);
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
      if (data[field] === undefined) continue;
      if (field === "default_kyc_tier") {
        const n = Number(data[field]);
        if (!Number.isInteger(n) || n < 1 || n > 3) {
          throw new ErrorClass("default_kyc_tier must be 1, 2, or 3", 400);
        }
        updateData[field] = n;
        continue;
      }
      updateData[field] = data[field];
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

  /** Sets merchant default KYC tier for new/onboarding flows (1–3). Column: `Merchants.default_kyc_tier`. */
  async setDefaultKycTier(accountKey, tier) {
    if (tier === undefined) {
      throw new ErrorClass("tier is required", 400);
    }
    return this.update(accountKey, { default_kyc_tier: tier });
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

  async linkBeamerAccount(accountKey, payload, httpHeaders = {}) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const productKeyMaterial = getBeamerProductKeyMaterial();
    if (!String(productKeyMaterial.targetProductKey || "").trim()) {
      throw new ErrorClass("TARGET_PRODUCT_KEY is required for beamer link", 500);
    }
    if (!String(productKeyMaterial.sourceProductKey || "").trim()) {
      throw new ErrorClass("SOURCE_PRODUCT_KEY is required for beamer link", 500);
    }

    const udara360 = await fetchLatestUdaraOne(accountKey);
    const { headers, data } = normalizeBeamerLinkPayload(payload, httpHeaders, merchant, udara360);

    if (!headers["User-Key"]) {
      throw new ErrorClass("User-Key is required", 400);
    }
    if (!headers["Accout-Key"]) {
      throw new ErrorClass("Accout-Key is required", 400);
    }
    if (!headers["Request-Id"]) {
      throw new ErrorClass("Request-Id is required", 400);
    }
    if (!data.account_number) {
      throw new ErrorClass("account_number is required", 400);
    }
    if (!data.client.id) {
      throw new ErrorClass("client.id is required", 400);
    }
    if (!data.client.key) {
      throw new ErrorClass("client.key is required", 400);
    }

    const outboundHeaders = buildBeamerOutboundHeaders(productKeyMaterial, headers, { link: true });
    const productKeys = getBeamerProductKeys();

    if (!outboundHeaders["Target-Product-Key"]) {
      throw new ErrorClass("Target-Product-Key could not be resolved after decryption", 500);
    }
    if (!outboundHeaders["Source-Product-Key"]) {
      throw new ErrorClass("Source-Product-Key could not be resolved after decryption", 500);
    }
    if (!outboundHeaders["User-Key"]) {
      throw new ErrorClass("User-Key could not be resolved after decryption", 400);
    }
    if (!outboundHeaders["Accout-Key"]) {
      throw new ErrorClass("Accout-Key could not be resolved after decryption", 400);
    }
    if (!outboundHeaders["Request-Id"]) {
      throw new ErrorClass("Request-Id could not be resolved after decryption", 400);
    }

    try {
      const response = await axios.post(
        "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Link",
        data,
        { headers: outboundHeaders },
      );
      return finalizeIsvsHttpBody(response.data, productKeys, outboundHeaders);
    } catch (error) {
      if (error instanceof ErrorClass || error instanceof IsvsPassthroughError) throw error;
      throwIsvsAxiosError(error);
    }
  }

  async updateBeamerAccount(accountKey, payload, httpHeaders = {}) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const productKeyMaterial = getBeamerProductKeyMaterial();
    if (!String(productKeyMaterial.targetProductKey || "").trim()) {
      throw new ErrorClass("TARGET_PRODUCT_KEY is required for beamer update", 500);
    }
    if (!String(productKeyMaterial.sourceProductKey || "").trim()) {
      throw new ErrorClass("SOURCE_PRODUCT_KEY is required for beamer update", 500);
    }

    const udara360 = await fetchLatestUdaraOne(accountKey);
    const { headers, data } = normalizeBeamerUpdatePayload(payload, httpHeaders, udara360);

    if (!headers["Request-Id"]) {
      throw new ErrorClass("Request-Id is required", 400);
    }
    if (!udara360) {
      throw new ErrorClass(
        "This merchant has no Udara360 integration on file. Use POST .../integrations/beamer/account-link for first-time linking, not account-update.",
        400,
        { hint: "account-link creates the integration; account-update only refreshes an existing one" },
      );
    }
    if (!data.id) {
      throw new ErrorClass("data.id is required (Udara360 integration identifier)", 400);
    }
    if (!data.account_number) {
      throw new ErrorClass("account_number is required", 400);
    }
    if (!data.client.id) {
      throw new ErrorClass("client.id is required", 400);
    }
    if (!data.client.key) {
      throw new ErrorClass("client.key is required", 400);
    }

    const outboundHeaders = buildBeamerOutboundHeaders(productKeyMaterial, headers);
    const productKeys = getBeamerProductKeys();

    if (!outboundHeaders["Target-Product-Key"]) {
      throw new ErrorClass("Target-Product-Key could not be resolved after decryption", 500);
    }
    if (!outboundHeaders["Source-Product-Key"]) {
      throw new ErrorClass("Source-Product-Key could not be resolved after decryption", 500);
    }
    if (!outboundHeaders["Request-Id"]) {
      throw new ErrorClass("Request-Id could not be resolved after decryption", 400);
    }

    try {
      const response = await axios.post(
        "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Update",
        data,
        { headers: outboundHeaders },
      );
      return finalizeIsvsHttpBody(response.data, productKeys, outboundHeaders);
    } catch (error) {
      if (error instanceof ErrorClass || error instanceof IsvsPassthroughError) throw error;
      throwIsvsAxiosError(error);
    }
  }
}
