import { eq, and, or, between, gte, lte, desc, count, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { deposits, withdrawals, transfers, swaps } from "../db/schema/transactions.js";
import { ngnDeposits, ngnPayouts } from "../db/schema/fiat.js";
import { cryptoDeposits, cryptoPayouts } from "../db/schema/crypto.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { isMissingMysqlTableError } from "../utils/mysqlErrors.js";

async function paginated(table, { where, limit, offset }) {
  const [rows, countRows] = await Promise.all([
    db.select().from(table).where(where).limit(limit).offset(offset).orderBy(desc(table.date_created)),
    db.select({ total: count() }).from(table).where(where),
  ]);
  const rawTotal = countRows[0]?.total ?? 0;
  return { count: Number(rawTotal), rows };
}

/** Same as paginated, but returns an empty page when the physical table is absent (env without fiat/crypto ledger tables). */
async function paginatedOrEmpty(table, opts) {
  try {
    return await paginated(table, opts);
  } catch (e) {
    if (isMissingMysqlTableError(e)) return { count: 0, rows: [] };
    throw e;
  }
}

async function loadWalletOwnerMap(walletKeys = []) {
  const keys = [...new Set(walletKeys.filter(Boolean))];
  if (keys.length === 0) return new Map();

  const values = sql.join(keys.map((k) => sql`${k}`), sql`, `);
  const [rows] = await db.execute(sql`
    SELECT wallet_key, owner_name
    FROM (
      SELECT
        ml.wallet_key AS wallet_key,
        COALESCE(m.trade_name, m.name, ml.account_key) AS owner_name
      FROM MerchantLedgers ml
      LEFT JOIN Merchants m ON m.account_key = ml.account_key
      WHERE ml.wallet_key IN (${values})

      UNION ALL

      SELECT
        cw.wallet_key AS wallet_key,
        NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.surname, ''))), '') AS owner_name
      FROM CustomerWallets cw
      LEFT JOIN Customers c ON c.identifier = cw.identifier
      WHERE cw.wallet_key IN (${values})
    ) t
  `);

  const map = new Map();
  for (const row of rows || []) {
    if (!row.wallet_key || map.has(row.wallet_key)) continue;
    map.set(row.wallet_key, row.owner_name || null);
  }
  return map;
}

async function enrichTransferRows(rows = []) {
  const keys = rows.flatMap((r) => [r.source_wallet_key, r.target_wallet_key]).filter(Boolean);
  const nameMap = await loadWalletOwnerMap(keys);

  return rows.map((row) => ({
    ...row,
    sender_wallet_key: row.source_wallet_key || null,
    recipient_wallet_key: row.target_wallet_key || null,
    sender_name: nameMap.get(row.source_wallet_key) || null,
    recipient_name: nameMap.get(row.target_wallet_key) || null,
  }));
}

async function enrichSwapRows(rows = []) {
  const keys = rows
    .flatMap((r) => [r.source_from_wallet_key, r.source_to_wallet_key, r.target_from_wallet_key, r.target_to_wallet_key])
    .filter(Boolean);
  const nameMap = await loadWalletOwnerMap(keys);

  return rows.map((row) => ({
    ...row,
    sender_wallet_key: row.source_from_wallet_key || row.target_from_wallet_key || null,
    recipient_wallet_key: row.source_to_wallet_key || row.target_to_wallet_key || null,
    sender_name:
      nameMap.get(row.source_from_wallet_key) ||
      nameMap.get(row.target_from_wallet_key) ||
      null,
    recipient_name:
      nameMap.get(row.source_to_wallet_key) ||
      nameMap.get(row.target_to_wallet_key) ||
      null,
  }));
}

async function loadCustomerWalletKeySet(identifier) {
  const rows = await db
    .select({ wallet_key: customerWallets.wallet_key })
    .from(customerWallets)
    .where(eq(customerWallets.identifier, identifier));
  return new Set(rows.map((r) => r.wallet_key));
}

/**
 * When `filters.identifier` is set, resolve the customer's wallets (and validate
 * optional account_key / wallet_key). Matches GET /transactions/statement behavior.
 * @returns {{ walletKeys: string[] | null, empty: boolean, identifier: string | null }}
 */
async function resolveCustomerWalletScope(filters) {
  if (!filters?.identifier) {
    return { walletKeys: null, empty: false, identifier: null };
  }

  const identifier = String(filters.identifier).trim();
  const [customer] = await db
    .select({ account_key: customers.account_key })
    .from(customers)
    .where(eq(customers.identifier, identifier))
    .limit(1);

  if (!customer) {
    throw new ErrorClass("Customer not found", 404);
  }
  if (filters.account_key && customer.account_key !== filters.account_key) {
    throw new ErrorClass("account_key does not match this customer", 400);
  }

  const keySet = await loadCustomerWalletKeySet(identifier);
  if (filters.wallet_key && !keySet.has(filters.wallet_key)) {
    throw new ErrorClass("wallet_key does not belong to this customer", 400);
  }
  if (keySet.size === 0) {
    return { walletKeys: [], empty: true, identifier };
  }

  return { walletKeys: [...keySet], empty: false, identifier };
}

function emptyTxPage() {
  return { count: 0, rows: [] };
}

function walletKeysTouchCondition(columns, walletKeys) {
  if (!walletKeys?.length) return null;
  const parts = columns.filter(Boolean).map((col) => inArray(col, walletKeys));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : or(...parts);
}

function appendPayoutCustomerScope(conditions, sourceWalletCol, sourceIdentifierCol, scope) {
  if (!scope?.walletKeys?.length && !scope?.identifier) return;
  const parts = [];
  if (scope.walletKeys?.length) {
    parts.push(inArray(sourceWalletCol, scope.walletKeys));
  }
  if (scope.identifier && sourceIdentifierCol) {
    parts.push(eq(sourceIdentifierCol, scope.identifier));
  }
  if (parts.length === 0) return;
  conditions.push(parts.length === 1 ? parts[0] : or(...parts));
}

function appendDateRange(conditions, table, filters) {
  if (filters.from_date && filters.to_date) {
    conditions.push(
      between(table.date_created, new Date(filters.from_date), new Date(filters.to_date)),
    );
  } else if (filters.from_date) {
    conditions.push(gte(table.date_created, new Date(filters.from_date)));
  } else if (filters.to_date) {
    conditions.push(lte(table.date_created, new Date(filters.to_date)));
  }
}

function appendWalletKeyFilter(conditions, sourceCol, targetCol, filters) {
  if (!filters.wallet_key) return;
  if (targetCol) {
    conditions.push(
      or(eq(sourceCol, filters.wallet_key), eq(targetCol, filters.wallet_key)),
    );
  } else {
    conditions.push(eq(sourceCol, filters.wallet_key));
  }
}

function appendSwapWalletKeyFilter(conditions, filters) {
  if (!filters.wallet_key) return;
  const w = filters.wallet_key;
  conditions.push(
    or(
      eq(swaps.source_from_wallet_key, w),
      eq(swaps.source_to_wallet_key, w),
      eq(swaps.target_from_wallet_key, w),
      eq(swaps.target_to_wallet_key, w),
    ),
  );
}

function whereFromConditions(conditions) {
  const parts = conditions.filter(Boolean);
  return parts.length > 0 ? and(...parts) : undefined;
}

function rowTouchesWalletKeys(row, keys) {
  if (!keys || keys.size === 0) return false;
  const ks = [row.wallet_key, row.counterpart_wallet_key, row.swap_wallet_key_3, row.swap_wallet_key_4];
  return ks.some((k) => k && keys.has(k));
}

function rowTouchesSingleWallet(row, walletKey) {
  if (!walletKey) return true;
  return [row.wallet_key, row.counterpart_wallet_key, row.swap_wallet_key_3, row.swap_wallet_key_4].some(
    (k) => k === walletKey,
  );
}

const STMT_EXT_KEYS = [
  "stmt_ext_sender_name",
  "stmt_ext_sender_bank",
  "stmt_ext_sender_account",
  "stmt_ext_recipient_name",
  "stmt_ext_recipient_bank",
  "stmt_ext_recipient_account",
];

function stmtExtSelectNulls() {
  return {
    stmt_ext_sender_name: sql`NULL`,
    stmt_ext_sender_bank: sql`NULL`,
    stmt_ext_sender_account: sql`NULL`,
    stmt_ext_recipient_name: sql`NULL`,
    stmt_ext_recipient_bank: sql`NULL`,
    stmt_ext_recipient_account: sql`NULL`,
  };
}

function trimJoinNameBank(name, bank) {
  const n = String(name ?? "").trim();
  const b = String(bank ?? "").trim();
  if (!n && !b) return null;
  if (n && b) return `${n} (${b})`;
  return n || b || null;
}

function normalizeAcct(value) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

/** Short label when only a chain/crypto address exists (not a legal name). */
function formatAddressSnippet(addr) {
  const s = String(addr ?? "").trim();
  if (!s) return null;
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function stripStmtExtFields(row) {
  const out = { ...row };
  for (const k of STMT_EXT_KEYS) delete out[k];
  return out;
}

function resolveStatementPartyLabels(row, walletName, counterpartName) {
  const sn = row.stmt_ext_sender_name;
  const sb = row.stmt_ext_sender_bank;
  const sa = row.stmt_ext_sender_account;
  const rn = row.stmt_ext_recipient_name;
  const rb = row.stmt_ext_recipient_bank;
  const ra = row.stmt_ext_recipient_account;

  let sender_name = null;
  let recipient_name = null;
  let sender_account_number = null;
  let recipient_account_number = null;

  switch (row.transaction_type) {
    case "ngn_deposit":
      sender_name = trimJoinNameBank(sn, sb);
      sender_account_number = normalizeAcct(sa);
      recipient_name = walletName;
      recipient_account_number = normalizeAcct(ra);
      break;
    case "ngn_payout":
      sender_name = walletName || trimJoinNameBank(sn, null);
      sender_account_number = normalizeAcct(sa);
      recipient_name = trimJoinNameBank(rn, rb);
      recipient_account_number = normalizeAcct(ra);
      break;
    case "deposit":
    case "withdrawal":
      sender_name = walletName;
      recipient_name = counterpartName;
      break;
    case "transfer":
    case "swap":
      sender_name = walletName;
      recipient_name = counterpartName;
      break;
    case "crypto_deposit":
      sender_account_number = normalizeAcct(sa);
      recipient_account_number = normalizeAcct(ra);
      sender_name = formatAddressSnippet(sa);
      recipient_name = walletName;
      break;
    case "crypto_payout":
      sender_name = walletName;
      sender_account_number = normalizeAcct(sa);
      recipient_account_number = normalizeAcct(ra);
      recipient_name = formatAddressSnippet(ra);
      break;
    default:
      break;
  }

  return { sender_name, recipient_name, sender_account_number, recipient_account_number };
}

export default class TransactionService {
  async getDeposits({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(deposits.account_key, filters.account_key));
    appendWalletKeyFilter(conditions, deposits.source_wallet_key, deposits.target_wallet_key, filters);
    const touch = walletKeysTouchCondition(
      [deposits.source_wallet_key, deposits.target_wallet_key],
      scope.walletKeys,
    );
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(deposits.status, filters.status));
    if (filters.currency_code) conditions.push(eq(deposits.currency_code, filters.currency_code));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(${deposits.source_wallet_key} LIKE ${pattern} OR ${deposits.source_reference} LIKE ${pattern} OR ${deposits.target_reference} LIKE ${pattern})`,
      );
    }
    appendDateRange(conditions, deposits, filters);

    return paginated(deposits, { where: whereFromConditions(conditions), limit, offset });
  }

  async getWithdrawals({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(withdrawals.account_key, filters.account_key));
    appendWalletKeyFilter(conditions, withdrawals.source_wallet_key, withdrawals.target_wallet_key, filters);
    const touch = walletKeysTouchCondition(
      [withdrawals.source_wallet_key, withdrawals.target_wallet_key],
      scope.walletKeys,
    );
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(withdrawals.status, filters.status));
    if (filters.currency_code) conditions.push(eq(withdrawals.currency_code, filters.currency_code));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(${withdrawals.source_wallet_key} LIKE ${pattern} OR ${withdrawals.source_reference} LIKE ${pattern} OR ${withdrawals.target_reference} LIKE ${pattern})`,
      );
    }
    appendDateRange(conditions, withdrawals, filters);

    return paginated(withdrawals, { where: whereFromConditions(conditions), limit, offset });
  }

  async getTransfers({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(transfers.account_key, filters.account_key));
    appendWalletKeyFilter(conditions, transfers.source_wallet_key, transfers.target_wallet_key, filters);
    const touch = walletKeysTouchCondition(
      [transfers.source_wallet_key, transfers.target_wallet_key],
      scope.walletKeys,
    );
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(transfers.status, filters.status));
    if (filters.currency_code) conditions.push(eq(transfers.currency_code, filters.currency_code));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(${transfers.source_wallet_key} LIKE ${pattern} OR ${transfers.source_reference} LIKE ${pattern} OR ${transfers.target_reference} LIKE ${pattern})`,
      );
    }
    appendDateRange(conditions, transfers, filters);

    const data = await paginated(transfers, { where: whereFromConditions(conditions), limit, offset });
    return { ...data, rows: await enrichTransferRows(data.rows) };
  }

  async getSwaps({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(swaps.account_key, filters.account_key));
    appendSwapWalletKeyFilter(conditions, filters);
    const touch = walletKeysTouchCondition(
      [
        swaps.source_from_wallet_key,
        swaps.source_to_wallet_key,
        swaps.target_from_wallet_key,
        swaps.target_to_wallet_key,
      ],
      scope.walletKeys,
    );
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(swaps.status, filters.status));
    if (filters.currency_code) conditions.push(eq(swaps.source_currency_code, filters.currency_code));
    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        sql`(
          ${swaps.source_from_wallet_key} LIKE ${pattern}
          OR ${swaps.source_to_wallet_key} LIKE ${pattern}
          OR ${swaps.source_from_reference} LIKE ${pattern}
          OR ${swaps.source_to_reference} LIKE ${pattern}
        )`,
      );
    }
    appendDateRange(conditions, swaps, filters);

    const data = await paginated(swaps, { where: whereFromConditions(conditions), limit, offset });
    return { ...data, rows: await enrichSwapRows(data.rows) };
  }

  async getNGNDeposits({ limit, offset, filters }) {
    if (filters.currency_code && String(filters.currency_code).toUpperCase() !== "NGN") {
      return emptyTxPage();
    }

    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    appendWalletKeyFilter(conditions, ngnDeposits.wallet_key, null, filters);
    const touch = walletKeysTouchCondition([ngnDeposits.wallet_key], scope.walletKeys);
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(ngnDeposits.credit_status, filters.status));
    if (filters.search) {
      conditions.push(
        sql`(
          ${ngnDeposits.wallet_key} LIKE ${`%${filters.search}%`}
          OR ${ngnDeposits.deposit_reference} LIKE ${`%${filters.search}%`}
          OR ${ngnDeposits.recipient_account_number} LIKE ${`%${filters.search}%`}
        )`,
      );
    }
    appendDateRange(conditions, ngnDeposits, filters);

    return paginatedOrEmpty(ngnDeposits, { where: whereFromConditions(conditions), limit, offset });
  }

  async getNGNPayouts({ limit, offset, filters }) {
    if (filters.currency_code && String(filters.currency_code).toUpperCase() !== "NGN") {
      return emptyTxPage();
    }

    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(ngnPayouts.account_key, filters.account_key));
    if (filters.wallet_key) conditions.push(eq(ngnPayouts.source_wallet_key, filters.wallet_key));
    appendPayoutCustomerScope(conditions, ngnPayouts.source_wallet_key, ngnPayouts.source_identifier, scope);
    if (filters.status) conditions.push(eq(ngnPayouts.payout_status, filters.status));
    if (filters.search) {
      conditions.push(
        sql`(
          ${ngnPayouts.source_wallet_key} LIKE ${`%${filters.search}%`}
          OR ${ngnPayouts.live_reference} LIKE ${`%${filters.search}%`}
          OR ${ngnPayouts.recipient_account_number} LIKE ${`%${filters.search}%`}
        )`,
      );
    }
    appendDateRange(conditions, ngnPayouts, filters);

    return paginatedOrEmpty(ngnPayouts, { where: whereFromConditions(conditions), limit, offset });
  }

  async getCryptoDeposits({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    appendWalletKeyFilter(conditions, cryptoDeposits.wallet_key, null, filters);
    const touch = walletKeysTouchCondition([cryptoDeposits.wallet_key], scope.walletKeys);
    if (touch) conditions.push(touch);
    if (filters.status) conditions.push(eq(cryptoDeposits.credit_status, filters.status));
    if (filters.search) {
      conditions.push(
        sql`(
          ${cryptoDeposits.wallet_key} LIKE ${`%${filters.search}%`}
          OR ${cryptoDeposits.deposit_reference} LIKE ${`%${filters.search}%`}
          OR ${cryptoDeposits.hash} LIKE ${`%${filters.search}%`}
        )`,
      );
    }
    appendDateRange(conditions, cryptoDeposits, filters);

    return paginatedOrEmpty(cryptoDeposits, { where: whereFromConditions(conditions), limit, offset });
  }

  async getCryptoPayouts({ limit, offset, filters }) {
    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) return emptyTxPage();

    const conditions = [];
    if (filters.account_key) conditions.push(eq(cryptoPayouts.account_key, filters.account_key));
    if (filters.wallet_key) conditions.push(eq(cryptoPayouts.source_wallet_key, filters.wallet_key));
    appendPayoutCustomerScope(conditions, cryptoPayouts.source_wallet_key, cryptoPayouts.source_identifier, scope);
    if (filters.status) conditions.push(eq(cryptoPayouts.payout_status, filters.status));
    if (filters.currency_code) conditions.push(eq(cryptoPayouts.asset, filters.currency_code));
    if (filters.search) {
      conditions.push(
        sql`(
          ${cryptoPayouts.source_wallet_key} LIKE ${`%${filters.search}%`}
          OR ${cryptoPayouts.live_reference} LIKE ${`%${filters.search}%`}
          OR ${cryptoPayouts.hash} LIKE ${`%${filters.search}%`}
        )`,
      );
    }
    appendDateRange(conditions, cryptoPayouts, filters);

    return paginatedOrEmpty(cryptoPayouts, { where: whereFromConditions(conditions), limit, offset });
  }

  async getStatement({ limit, offset, filters }) {
    const perSource = limit + offset;
    const fromDate = filters.from_date ? new Date(filters.from_date) : null;
    const toDate = filters.to_date ? new Date(filters.to_date) : null;
    const searchTerm = filters.search ? String(filters.search).toLowerCase() : null;
    const currencyFilter = filters.currency_code ? String(filters.currency_code).toUpperCase() : null;

    const scope = await resolveCustomerWalletScope(filters);
    if (scope.empty) {
      return { count: 0, rows: [] };
    }

    const customerWalletKeysArr = scope.walletKeys;
    const customerWalletKeySet = customerWalletKeysArr ? new Set(customerWalletKeysArr) : null;
    const applyDate = (table, conditions) => {
      if (fromDate && toDate) {
        conditions.push(between(table.date_created, fromDate, toDate));
      } else if (fromDate) {
        conditions.push(gte(table.date_created, fromDate));
      } else if (toDate) {
        conditions.push(lte(table.date_created, toDate));
      }
    };

    const [
      depRows,
      wdrRows,
      trfRows,
      swpRows,
      ngnDepRows,
      ngnPayRows,
      cDepRows,
      cPayRows,
    ] = await Promise.all([
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(deposits.account_key, filters.account_key));
        if (filters.wallet_key) {
          conditions.push(or(eq(deposits.source_wallet_key, filters.wallet_key), eq(deposits.target_wallet_key, filters.wallet_key)));
        }
        if (customerWalletKeysArr) {
          conditions.push(
            or(
              inArray(deposits.source_wallet_key, customerWalletKeysArr),
              inArray(deposits.target_wallet_key, customerWalletKeysArr),
            ),
          );
        }
        applyDate(deposits, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'deposit'`.as("transaction_type"),
          account_key: deposits.account_key,
          reference: deposits.source_reference,
          wallet_key: deposits.source_wallet_key,
          counterpart_wallet_key: deposits.target_wallet_key,
          currency_code: deposits.currency_code,
          amount: deposits.amount,
          status: deposits.status,
          date_created: deposits.date_created,
          ...stmtExtSelectNulls(),
        }).from(deposits).where(where).orderBy(desc(deposits.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(withdrawals.account_key, filters.account_key));
        if (filters.wallet_key) {
          conditions.push(or(eq(withdrawals.source_wallet_key, filters.wallet_key), eq(withdrawals.target_wallet_key, filters.wallet_key)));
        }
        if (customerWalletKeysArr) {
          conditions.push(
            or(
              inArray(withdrawals.source_wallet_key, customerWalletKeysArr),
              inArray(withdrawals.target_wallet_key, customerWalletKeysArr),
            ),
          );
        }
        applyDate(withdrawals, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'withdrawal'`.as("transaction_type"),
          account_key: withdrawals.account_key,
          reference: withdrawals.source_reference,
          wallet_key: withdrawals.source_wallet_key,
          counterpart_wallet_key: withdrawals.target_wallet_key,
          currency_code: withdrawals.currency_code,
          amount: withdrawals.amount,
          status: withdrawals.status,
          date_created: withdrawals.date_created,
          ...stmtExtSelectNulls(),
        }).from(withdrawals).where(where).orderBy(desc(withdrawals.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(transfers.account_key, filters.account_key));
        if (filters.wallet_key) {
          conditions.push(or(eq(transfers.source_wallet_key, filters.wallet_key), eq(transfers.target_wallet_key, filters.wallet_key)));
        }
        if (customerWalletKeysArr) {
          conditions.push(
            or(
              inArray(transfers.source_wallet_key, customerWalletKeysArr),
              inArray(transfers.target_wallet_key, customerWalletKeysArr),
            ),
          );
        }
        applyDate(transfers, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'transfer'`.as("transaction_type"),
          account_key: transfers.account_key,
          reference: transfers.source_reference,
          wallet_key: transfers.source_wallet_key,
          counterpart_wallet_key: transfers.target_wallet_key,
          currency_code: transfers.currency_code,
          amount: transfers.amount,
          status: transfers.status,
          date_created: transfers.date_created,
          ...stmtExtSelectNulls(),
        }).from(transfers).where(where).orderBy(desc(transfers.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(swaps.account_key, filters.account_key));
        if (filters.wallet_key) {
          conditions.push(
            or(
              eq(swaps.source_from_wallet_key, filters.wallet_key),
              eq(swaps.source_to_wallet_key, filters.wallet_key),
              eq(swaps.target_from_wallet_key, filters.wallet_key),
              eq(swaps.target_to_wallet_key, filters.wallet_key),
            ),
          );
        }
        if (customerWalletKeysArr) {
          conditions.push(
            or(
              inArray(swaps.source_from_wallet_key, customerWalletKeysArr),
              inArray(swaps.source_to_wallet_key, customerWalletKeysArr),
              inArray(swaps.target_from_wallet_key, customerWalletKeysArr),
              inArray(swaps.target_to_wallet_key, customerWalletKeysArr),
            ),
          );
        }
        applyDate(swaps, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'swap'`.as("transaction_type"),
          account_key: swaps.account_key,
          reference: swaps.source_from_reference,
          wallet_key: swaps.source_from_wallet_key,
          counterpart_wallet_key: swaps.source_to_wallet_key,
          swap_wallet_key_3: swaps.target_from_wallet_key,
          swap_wallet_key_4: swaps.target_to_wallet_key,
          currency_code: swaps.source_currency_code,
          amount: swaps.source_amount,
          status: swaps.status,
          date_created: swaps.date_created,
          ...stmtExtSelectNulls(),
        }).from(swaps).where(where).orderBy(desc(swaps.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.wallet_key) conditions.push(eq(ngnDeposits.wallet_key, filters.wallet_key));
        if (customerWalletKeysArr) {
          conditions.push(inArray(ngnDeposits.wallet_key, customerWalletKeysArr));
        }
        applyDate(ngnDeposits, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'ngn_deposit'`.as("transaction_type"),
          account_key: sql`NULL`.as("account_key"),
          reference: ngnDeposits.deposit_reference,
          wallet_key: ngnDeposits.wallet_key,
          counterpart_wallet_key: sql`NULL`.as("counterpart_wallet_key"),
          swap_wallet_key_3: sql`NULL`.as("swap_wallet_key_3"),
          swap_wallet_key_4: sql`NULL`.as("swap_wallet_key_4"),
          currency_code: sql`'NGN'`.as("currency_code"),
          amount: ngnDeposits.amount,
          status: ngnDeposits.credit_status,
          date_created: ngnDeposits.date_created,
          stmt_ext_sender_name: ngnDeposits.sender_account_name,
          stmt_ext_sender_bank: ngnDeposits.sender_bank_name,
          stmt_ext_sender_account: ngnDeposits.sender_account_number,
          stmt_ext_recipient_name: sql`NULL`,
          stmt_ext_recipient_bank: sql`NULL`,
          stmt_ext_recipient_account: ngnDeposits.recipient_account_number,
        }).from(ngnDeposits).where(where).orderBy(desc(ngnDeposits.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(ngnPayouts.account_key, filters.account_key));
        if (filters.wallet_key) conditions.push(eq(ngnPayouts.source_wallet_key, filters.wallet_key));
        appendPayoutCustomerScope(conditions, ngnPayouts.source_wallet_key, ngnPayouts.source_identifier, scope);
        applyDate(ngnPayouts, conditions);
        const where = whereFromConditions(conditions);
        return db.select({
          transaction_type: sql`'ngn_payout'`.as("transaction_type"),
          account_key: ngnPayouts.account_key,
          reference: ngnPayouts.live_reference,
          wallet_key: ngnPayouts.source_wallet_key,
          counterpart_wallet_key: sql`NULL`.as("counterpart_wallet_key"),
          swap_wallet_key_3: sql`NULL`.as("swap_wallet_key_3"),
          swap_wallet_key_4: sql`NULL`.as("swap_wallet_key_4"),
          currency_code: sql`'NGN'`.as("currency_code"),
          amount: ngnPayouts.amount,
          status: ngnPayouts.payout_status,
          date_created: ngnPayouts.date_created,
          stmt_ext_sender_name: ngnPayouts.source_account_name,
          stmt_ext_sender_bank: sql`NULL`,
          stmt_ext_sender_account: ngnPayouts.source_account_number,
          stmt_ext_recipient_name: ngnPayouts.recipient_account_name,
          stmt_ext_recipient_bank: ngnPayouts.recipient_institution_name,
          stmt_ext_recipient_account: ngnPayouts.recipient_account_number,
        }).from(ngnPayouts).where(where).orderBy(desc(ngnPayouts.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.wallet_key) conditions.push(eq(cryptoDeposits.wallet_key, filters.wallet_key));
        if (customerWalletKeysArr) conditions.push(inArray(cryptoDeposits.wallet_key, customerWalletKeysArr));
        applyDate(cryptoDeposits, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        return db.select({
          transaction_type: sql`'crypto_deposit'`.as("transaction_type"),
          account_key: sql`NULL`.as("account_key"),
          reference: cryptoDeposits.deposit_reference,
          wallet_key: cryptoDeposits.wallet_key,
          counterpart_wallet_key: sql`NULL`.as("counterpart_wallet_key"),
          swap_wallet_key_3: sql`NULL`.as("swap_wallet_key_3"),
          swap_wallet_key_4: sql`NULL`.as("swap_wallet_key_4"),
          currency_code: sql`NULL`.as("currency_code"),
          amount: cryptoDeposits.amount,
          status: cryptoDeposits.credit_status,
          date_created: cryptoDeposits.date_created,
          stmt_ext_sender_name: sql`NULL`,
          stmt_ext_sender_bank: sql`NULL`,
          stmt_ext_sender_account: cryptoDeposits.sender_address,
          stmt_ext_recipient_name: sql`NULL`,
          stmt_ext_recipient_bank: sql`NULL`,
          stmt_ext_recipient_account: cryptoDeposits.recipient_address,
        }).from(cryptoDeposits).where(where).orderBy(desc(cryptoDeposits.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(cryptoPayouts.account_key, filters.account_key));
        if (filters.wallet_key) conditions.push(eq(cryptoPayouts.source_wallet_key, filters.wallet_key));
        appendPayoutCustomerScope(conditions, cryptoPayouts.source_wallet_key, cryptoPayouts.source_identifier, scope);
        applyDate(cryptoPayouts, conditions);
        const where = whereFromConditions(conditions);
        return db.select({
          transaction_type: sql`'crypto_payout'`.as("transaction_type"),
          account_key: cryptoPayouts.account_key,
          reference: cryptoPayouts.live_reference,
          wallet_key: cryptoPayouts.source_wallet_key,
          counterpart_wallet_key: sql`NULL`.as("counterpart_wallet_key"),
          swap_wallet_key_3: sql`NULL`.as("swap_wallet_key_3"),
          swap_wallet_key_4: sql`NULL`.as("swap_wallet_key_4"),
          currency_code: cryptoPayouts.asset,
          amount: cryptoPayouts.amount,
          status: cryptoPayouts.payout_status,
          date_created: cryptoPayouts.date_created,
          stmt_ext_sender_name: sql`NULL`,
          stmt_ext_sender_bank: sql`NULL`,
          stmt_ext_sender_account: cryptoPayouts.source_address,
          stmt_ext_recipient_name: sql`NULL`,
          stmt_ext_recipient_bank: sql`NULL`,
          stmt_ext_recipient_account: cryptoPayouts.recipient_address,
        }).from(cryptoPayouts).where(where).orderBy(desc(cryptoPayouts.date_created)).limit(perSource);
      })(),
    ]);

    const allRows = [...depRows, ...wdrRows, ...trfRows, ...swpRows, ...ngnDepRows, ...ngnPayRows, ...cDepRows, ...cPayRows];

    const filtered = allRows.filter((row) => {
      if (
        filters.account_key &&
        row.account_key != null &&
        row.account_key !== filters.account_key
      ) {
        return false;
      }
      if (filters.identifier && customerWalletKeySet && !rowTouchesWalletKeys(row, customerWalletKeySet)) {
        return false;
      }
      if (filters.wallet_key && !rowTouchesSingleWallet(row, filters.wallet_key)) return false;
      if (filters.status && String(row.status || "").toLowerCase() !== String(filters.status).toLowerCase()) return false;
      if (fromDate && new Date(row.date_created) < fromDate) return false;
      if (toDate && new Date(row.date_created) > toDate) return false;
      if (currencyFilter && String(row.currency_code || "").toUpperCase() !== currencyFilter) return false;
      if (searchTerm) {
        const haystack = [
          row.reference,
          row.wallet_key,
          row.transaction_type,
          row.stmt_ext_sender_name,
          row.stmt_ext_sender_bank,
          row.stmt_ext_sender_account,
          row.stmt_ext_recipient_name,
          row.stmt_ext_recipient_bank,
          row.stmt_ext_recipient_account,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });

    const walletKeysForNames = filtered
      .flatMap((row) => [row.wallet_key, row.counterpart_wallet_key, row.swap_wallet_key_3, row.swap_wallet_key_4])
      .filter(Boolean);
    const nameMap = await loadWalletOwnerMap(walletKeysForNames);

    const enriched = filtered.map((row) => {
      const { swap_wallet_key_3, swap_wallet_key_4, ...rest } = row;
      const walletName = nameMap.get(rest.wallet_key) || null;
      const counterpartName = nameMap.get(rest.counterpart_wallet_key) || null;
      const parties = resolveStatementPartyLabels(rest, walletName, counterpartName);
      const base = stripStmtExtFields(rest);
      return {
        ...base,
        wallet_name: walletName,
        counterpart_wallet_name: counterpartName,
        sender_name: parties.sender_name,
        recipient_name: parties.recipient_name,
        sender_account_number: parties.sender_account_number,
        recipient_account_number: parties.recipient_account_number,
      };
    });

    enriched.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

    return {
      count: enriched.length,
      rows: enriched.slice(offset, offset + limit),
    };
  }

  /**
   * Wallet-scoped ledger lines for the customer profile UI (service text + balance columns where available).
   */
  async getWalletLedger({ limit, offset, filters }) {
    const walletKey = filters.wallet_key ? String(filters.wallet_key).trim() : "";
    if (!walletKey) {
      throw new ErrorClass("wallet_key is required", 400);
    }

    const fromDate = filters.from_date ? new Date(filters.from_date) : null;
    const toDate = filters.to_date ? new Date(filters.to_date) : null;
    const searchTerm = filters.search ? String(filters.search).toLowerCase().trim() : null;
    const perSource = Math.min(2000, Math.max(limit + offset + 100, 200));

    const dateFilter = (table) => {
      if (fromDate && toDate) return between(table.date_created, fromDate, toDate);
      if (fromDate) return gte(table.date_created, fromDate);
      if (toDate) return lte(table.date_created, toDate);
      return undefined;
    };

    const andWalletDate = (table, walletCondition) => {
      const d = dateFilter(table);
      return d ? and(walletCondition, d) : walletCondition;
    };

    const [
      depRows,
      wdrRows,
      trfRows,
      swpRows,
      ngnDepRows,
      ngnPayRows,
      cDepRows,
      cPayRows,
    ] = await Promise.all([
      db
        .select()
        .from(deposits)
        .where(
          andWalletDate(
            deposits,
            or(eq(deposits.source_wallet_key, walletKey), eq(deposits.target_wallet_key, walletKey)),
          ),
        )
        .orderBy(desc(deposits.date_created))
        .limit(perSource),
      db
        .select()
        .from(withdrawals)
        .where(
          andWalletDate(
            withdrawals,
            or(eq(withdrawals.source_wallet_key, walletKey), eq(withdrawals.target_wallet_key, walletKey)),
          ),
        )
        .orderBy(desc(withdrawals.date_created))
        .limit(perSource),
      db
        .select()
        .from(transfers)
        .where(
          andWalletDate(
            transfers,
            or(eq(transfers.source_wallet_key, walletKey), eq(transfers.target_wallet_key, walletKey)),
          ),
        )
        .orderBy(desc(transfers.date_created))
        .limit(perSource),
      db
        .select()
        .from(swaps)
        .where(
          andWalletDate(
            swaps,
            or(
              eq(swaps.source_from_wallet_key, walletKey),
              eq(swaps.source_to_wallet_key, walletKey),
              eq(swaps.target_from_wallet_key, walletKey),
              eq(swaps.target_to_wallet_key, walletKey),
            ),
          ),
        )
        .orderBy(desc(swaps.date_created))
        .limit(perSource),
      db
        .select()
        .from(ngnDeposits)
        .where(andWalletDate(ngnDeposits, eq(ngnDeposits.wallet_key, walletKey)))
        .orderBy(desc(ngnDeposits.date_created))
        .limit(perSource),
      db
        .select()
        .from(ngnPayouts)
        .where(andWalletDate(ngnPayouts, eq(ngnPayouts.source_wallet_key, walletKey)))
        .orderBy(desc(ngnPayouts.date_created))
        .limit(perSource),
      db
        .select()
        .from(cryptoDeposits)
        .where(andWalletDate(cryptoDeposits, eq(cryptoDeposits.wallet_key, walletKey)))
        .orderBy(desc(cryptoDeposits.date_created))
        .limit(perSource),
      db
        .select()
        .from(cryptoPayouts)
        .where(andWalletDate(cryptoPayouts, eq(cryptoPayouts.source_wallet_key, walletKey)))
        .orderBy(desc(cryptoPayouts.date_created))
        .limit(perSource),
    ]);

    const lines = [];

    for (const d of depRows) {
      const isSource = d.source_wallet_key === walletKey;
      const opening = isSource ? d.source_opening_balance : d.target_opening_balance;
      const closing = isSource ? d.source_closing_balance : d.target_closing_balance;
      const service =
        [d.message, d.source_reference].filter(Boolean).join(" — ") ||
        `${d.currency_code || ""} deposit`.trim();
      lines.push({
        line_type: "deposit",
        reference: d.source_reference,
        service,
        currency_code: d.currency_code,
        amount: d.amount,
        opening_balance: opening ?? null,
        closing_balance: closing ?? null,
        status: d.status,
        date_created: d.date_created,
      });
    }

    for (const d of wdrRows) {
      const isSource = d.source_wallet_key === walletKey;
      const opening = isSource ? d.source_opening_balance : d.target_opening_balance;
      const closing = isSource ? d.source_closing_balance : d.target_closing_balance;
      const service = [d.message, d.source_reference].filter(Boolean).join(" — ") || "Withdrawal";
      lines.push({
        line_type: "withdrawal",
        reference: d.source_reference,
        service,
        currency_code: d.currency_code,
        amount: d.amount,
        opening_balance: opening ?? null,
        closing_balance: closing ?? null,
        status: d.status,
        date_created: d.date_created,
      });
    }

    for (const d of trfRows) {
      const isSource = d.source_wallet_key === walletKey;
      const opening = isSource ? d.source_opening_balance : d.target_opening_balance;
      const closing = isSource ? d.source_closing_balance : d.target_closing_balance;
      const peer = isSource ? d.target_wallet_key : d.source_wallet_key;
      const service = `Transfer ${isSource ? "out" : "in"}${peer ? ` (${peer})` : ""}`;
      lines.push({
        line_type: "transfer",
        reference: d.source_reference,
        service,
        currency_code: d.currency_code,
        amount: d.amount,
        opening_balance: opening ?? null,
        closing_balance: closing ?? null,
        status: d.status,
        date_created: d.date_created,
      });
    }

    for (const d of swpRows) {
      let opening = null;
      let closing = null;
      let leg = "swap";
      if (d.source_from_wallet_key === walletKey) {
        opening = d.source_from_opening_balance;
        closing = d.source_from_closing_balance;
        leg = "swap (source from)";
      } else if (d.source_to_wallet_key === walletKey) {
        opening = d.source_to_opening_balance;
        closing = d.source_to_closing_balance;
        leg = "swap (source to)";
      } else if (d.target_from_wallet_key === walletKey) {
        opening = d.target_from_opening_balance;
        closing = d.target_from_closing_balance;
        leg = "swap (target from)";
      } else if (d.target_to_wallet_key === walletKey) {
        opening = d.target_to_opening_balance;
        closing = d.target_to_closing_balance;
        leg = "swap (target to)";
      }
      const service = [d.message, d.source_from_reference, leg].filter(Boolean).join(" — ");
      lines.push({
        line_type: "swap",
        reference: d.source_from_reference,
        service,
        currency_code: d.source_currency_code,
        amount: d.source_amount,
        opening_balance: opening,
        closing_balance: closing,
        status: d.status,
        date_created: d.date_created,
      });
    }

    for (const d of ngnDepRows) {
      const parts = [d.sender_bank_name, d.sender_account_name, d.sender_account_number].filter(Boolean);
      const service = parts.length ? parts.join(" ") : d.deposit_reference || "NGN deposit";
      lines.push({
        line_type: "ngn_deposit",
        reference: d.deposit_reference,
        service,
        currency_code: "NGN",
        amount: d.amount,
        opening_balance: d.opening_balance ?? null,
        closing_balance: d.closing_balance ?? null,
        status: d.credit_status,
        date_created: d.date_created,
      });
    }

    for (const d of ngnPayRows) {
      const parts = [d.narration, d.recipient_account_name, d.recipient_account_number].filter(Boolean);
      const service = parts.length ? parts.join(" ") : d.live_reference || "NGN payout";
      lines.push({
        line_type: "ngn_payout",
        reference: d.live_reference,
        service,
        currency_code: "NGN",
        amount: d.amount,
        opening_balance: d.opening_balance ?? null,
        closing_balance: d.closing_balance ?? null,
        status: d.payout_status,
        date_created: d.date_created,
      });
    }

    for (const d of cDepRows) {
      lines.push({
        line_type: "crypto_deposit",
        reference: d.deposit_reference,
        service: [d.hash, d.deposit_reference].filter(Boolean).join(" — ") || "Crypto deposit",
        currency_code: null,
        amount: d.amount,
        opening_balance: d.opening_balance ?? null,
        closing_balance: d.closing_balance ?? null,
        status: d.credit_status,
        date_created: d.date_created,
      });
    }

    for (const d of cPayRows) {
      lines.push({
        line_type: "crypto_payout",
        reference: d.live_reference,
        service: d.live_reference || "Crypto payout",
        currency_code: d.asset || null,
        amount: d.amount,
        opening_balance: d.opening_balance ?? null,
        closing_balance: d.closing_balance ?? null,
        status: d.payout_status,
        date_created: d.date_created,
      });
    }

    let out = lines;
    if (searchTerm) {
      out = out.filter((row) => {
        const hay = `${row.service || ""} ${row.reference || ""} ${row.line_type || ""}`.toLowerCase();
        return hay.includes(searchTerm);
      });
    }

    out.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

    return {
      count: out.length,
      rows: out.slice(offset, offset + limit),
    };
  }
}
