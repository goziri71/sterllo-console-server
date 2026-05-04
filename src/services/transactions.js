import { eq, and, or, between, gte, lte, desc, count, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { deposits, withdrawals, transfers, swaps } from "../db/schema/transactions.js";
import { ngnDeposits, ngnPayouts } from "../db/schema/fiat.js";
import { cryptoDeposits, cryptoPayouts } from "../db/schema/crypto.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { isMissingMysqlTableError } from "../utils/mysqlErrors.js";

/**
 * Build an array of Drizzle conditions from common transaction filters.
 */
function buildConditions(
  table,
  filters,
  {
    hasAccountKey = true,
    walletColumn = "source_wallet_key",
    statusColumn = "status",
    currencyColumn = "currency_code",
    searchColumns = ["source_wallet_key", "source_reference", "target_reference"],
  } = {},
) {
  const conditions = [];

  if (hasAccountKey && filters.account_key && table.account_key) {
    conditions.push(eq(table.account_key, filters.account_key));
  }
  if (filters.wallet_key && table[walletColumn]) {
    conditions.push(eq(table[walletColumn], filters.wallet_key));
  }
  if (filters.status && table[statusColumn]) {
    conditions.push(eq(table[statusColumn], filters.status));
  }
  if (filters.currency_code && table[currencyColumn]) {
    conditions.push(eq(table[currencyColumn], filters.currency_code));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const parts = searchColumns
      .filter((col) => table[col])
      .map((col) => sql`${table[col]} LIKE ${pattern}`);
    if (parts.length > 0) {
      conditions.push(sql`(${sql.join(parts, sql` OR `)})`);
    }
  }
  if (filters.from_date && filters.to_date) {
    conditions.push(
      between(table.date_created, new Date(filters.from_date), new Date(filters.to_date))
    );
  } else if (filters.from_date) {
    conditions.push(gte(table.date_created, new Date(filters.from_date)));
  } else if (filters.to_date) {
    conditions.push(lte(table.date_created, new Date(filters.to_date)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

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

export default class TransactionService {
  async getDeposits({ limit, offset, filters }) {
    return paginated(deposits, {
      where: buildConditions(deposits, filters),
      limit,
      offset,
    });
  }

  async getWithdrawals({ limit, offset, filters }) {
    return paginated(withdrawals, {
      where: buildConditions(withdrawals, filters),
      limit,
      offset,
    });
  }

  async getTransfers({ limit, offset, filters }) {
    const data = await paginated(transfers, {
      where: buildConditions(transfers, filters),
      limit,
      offset,
    });
    return { ...data, rows: await enrichTransferRows(data.rows) };
  }

  async getSwaps({ limit, offset, filters }) {
    const data = await paginated(swaps, {
      where: buildConditions(swaps, filters, {
        walletColumn: "source_from_wallet_key",
        currencyColumn: "source_currency_code",
        searchColumns: [
          "source_from_wallet_key",
          "source_to_wallet_key",
          "source_from_reference",
          "source_to_reference",
        ],
      }),
      limit,
      offset,
    });
    return { ...data, rows: await enrichSwapRows(data.rows) };
  }

  async getNGNDeposits({ limit, offset, filters }) {
    if (filters.currency_code && String(filters.currency_code).toUpperCase() !== "NGN") {
      return { count: 0, rows: [] };
    }
    const conditions = [];
    if (filters.wallet_key) conditions.push(eq(ngnDeposits.wallet_key, filters.wallet_key));
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
    if (filters.from_date && filters.to_date) {
      conditions.push(between(ngnDeposits.date_created, new Date(filters.from_date), new Date(filters.to_date)));
    } else if (filters.from_date) {
      conditions.push(gte(ngnDeposits.date_created, new Date(filters.from_date)));
    } else if (filters.to_date) {
      conditions.push(lte(ngnDeposits.date_created, new Date(filters.to_date)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return paginatedOrEmpty(ngnDeposits, { where, limit, offset });
  }

  async getNGNPayouts({ limit, offset, filters }) {
    if (filters.currency_code && String(filters.currency_code).toUpperCase() !== "NGN") {
      return { count: 0, rows: [] };
    }
    const conditions = [];
    if (filters.account_key) conditions.push(eq(ngnPayouts.account_key, filters.account_key));
    if (filters.wallet_key) conditions.push(eq(ngnPayouts.source_wallet_key, filters.wallet_key));
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
    if (filters.from_date && filters.to_date) {
      conditions.push(between(ngnPayouts.date_created, new Date(filters.from_date), new Date(filters.to_date)));
    } else if (filters.from_date) {
      conditions.push(gte(ngnPayouts.date_created, new Date(filters.from_date)));
    } else if (filters.to_date) {
      conditions.push(lte(ngnPayouts.date_created, new Date(filters.to_date)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return paginatedOrEmpty(ngnPayouts, {
      where,
      limit,
      offset,
    });
  }

  async getCryptoDeposits({ limit, offset, filters }) {
    const conditions = [];
    if (filters.wallet_key) conditions.push(eq(cryptoDeposits.wallet_key, filters.wallet_key));
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
    if (filters.from_date && filters.to_date) {
      conditions.push(between(cryptoDeposits.date_created, new Date(filters.from_date), new Date(filters.to_date)));
    } else if (filters.from_date) {
      conditions.push(gte(cryptoDeposits.date_created, new Date(filters.from_date)));
    } else if (filters.to_date) {
      conditions.push(lte(cryptoDeposits.date_created, new Date(filters.to_date)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return paginatedOrEmpty(cryptoDeposits, { where, limit, offset });
  }

  async getCryptoPayouts({ limit, offset, filters }) {
    const conditions = [];
    if (filters.account_key) conditions.push(eq(cryptoPayouts.account_key, filters.account_key));
    if (filters.wallet_key) conditions.push(eq(cryptoPayouts.source_wallet_key, filters.wallet_key));
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
    if (filters.from_date && filters.to_date) {
      conditions.push(between(cryptoPayouts.date_created, new Date(filters.from_date), new Date(filters.to_date)));
    } else if (filters.from_date) {
      conditions.push(gte(cryptoPayouts.date_created, new Date(filters.from_date)));
    } else if (filters.to_date) {
      conditions.push(lte(cryptoPayouts.date_created, new Date(filters.to_date)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return paginatedOrEmpty(cryptoPayouts, {
      where,
      limit,
      offset,
    });
  }

  async getStatement({ limit, offset, filters }) {
    const perSource = limit + offset;
    const fromDate = filters.from_date ? new Date(filters.from_date) : null;
    const toDate = filters.to_date ? new Date(filters.to_date) : null;
    const searchTerm = filters.search ? String(filters.search).toLowerCase() : null;
    const currencyFilter = filters.currency_code ? String(filters.currency_code).toUpperCase() : null;

    let customerWalletKeys = null;
    if (filters.identifier) {
      const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.identifier, filters.identifier))
        .limit(1);
      if (!customer) {
        throw new ErrorClass("Customer not found", 404);
      }
      if (filters.account_key && customer.account_key !== filters.account_key) {
        throw new ErrorClass("account_key does not match this customer", 400);
      }
      customerWalletKeys = await loadCustomerWalletKeySet(filters.identifier);
      if (filters.wallet_key && !customerWalletKeys.has(filters.wallet_key)) {
        throw new ErrorClass("wallet_key does not belong to this customer", 400);
      }
      if (customerWalletKeys.size === 0) {
        return { count: 0, rows: [] };
      }
    }

    const customerWalletKeysArr = customerWalletKeys ? [...customerWalletKeys] : null;
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
        }).from(ngnDeposits).where(where).orderBy(desc(ngnDeposits.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(ngnPayouts.account_key, filters.account_key));
        if (filters.wallet_key) conditions.push(eq(ngnPayouts.source_wallet_key, filters.wallet_key));
        if (customerWalletKeysArr) {
          conditions.push(
            or(
              inArray(ngnPayouts.source_wallet_key, customerWalletKeysArr),
              filters.identifier ? eq(ngnPayouts.source_identifier, filters.identifier) : undefined,
            ),
          );
        }
        applyDate(ngnPayouts, conditions);
        const where = conditions.filter(Boolean).length > 0 ? and(...conditions.filter(Boolean)) : undefined;
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
        }).from(cryptoDeposits).where(where).orderBy(desc(cryptoDeposits.date_created)).limit(perSource);
      })(),
      (() => {
        const conditions = [];
        if (filters.account_key) conditions.push(eq(cryptoPayouts.account_key, filters.account_key));
        if (filters.wallet_key) conditions.push(eq(cryptoPayouts.source_wallet_key, filters.wallet_key));
        if (customerWalletKeysArr) conditions.push(inArray(cryptoPayouts.source_wallet_key, customerWalletKeysArr));
        applyDate(cryptoPayouts, conditions);
        const where = conditions.length > 0 ? and(...conditions) : undefined;
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
        }).from(cryptoPayouts).where(where).orderBy(desc(cryptoPayouts.date_created)).limit(perSource);
      })(),
    ]);

    const allRows = [...depRows, ...wdrRows, ...trfRows, ...swpRows, ...ngnDepRows, ...ngnPayRows, ...cDepRows, ...cPayRows];

    const filtered = allRows.filter((row) => {
      if (filters.account_key && row.account_key !== filters.account_key) return false;
      if (filters.identifier && !rowTouchesWalletKeys(row, customerWalletKeys)) return false;
      if (filters.wallet_key && !rowTouchesSingleWallet(row, filters.wallet_key)) return false;
      if (filters.status && String(row.status || "").toLowerCase() !== String(filters.status).toLowerCase()) return false;
      if (fromDate && new Date(row.date_created) < fromDate) return false;
      if (toDate && new Date(row.date_created) > toDate) return false;
      if (currencyFilter && String(row.currency_code || "").toUpperCase() !== currencyFilter) return false;
      if (searchTerm) {
        const haystack = `${row.reference || ""} ${row.wallet_key || ""} ${row.transaction_type || ""}`.toLowerCase();
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
      return {
        ...rest,
        wallet_name: walletName,
        counterpart_wallet_name: counterpartName,
        sender_name:
          rest.transaction_type === "transfer" || rest.transaction_type === "swap"
            ? walletName
            : null,
        recipient_name:
          rest.transaction_type === "transfer" || rest.transaction_type === "swap"
            ? counterpartName
            : null,
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
