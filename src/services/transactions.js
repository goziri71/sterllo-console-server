import { eq, and, between, gte, lte, desc, count, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { deposits, withdrawals, transfers, swaps } from "../db/schema/transactions.js";
import { ngnDeposits, ngnPayouts } from "../db/schema/fiat.js";
import { cryptoDeposits, cryptoPayouts } from "../db/schema/crypto.js";

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
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(table).where(where).limit(limit).offset(offset).orderBy(desc(table.date_created)),
    db.select({ total: count() }).from(table).where(where),
  ]);
  return { count: Number(total), rows };
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
    return paginated(transfers, {
      where: buildConditions(transfers, filters),
      limit,
      offset,
    });
  }

  async getSwaps({ limit, offset, filters }) {
    return paginated(swaps, {
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

    return paginated(ngnDeposits, { where, limit, offset });
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

    return paginated(ngnPayouts, {
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

    return paginated(cryptoDeposits, { where, limit, offset });
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

    return paginated(cryptoPayouts, {
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
      db.select({
        transaction_type: sql`'deposit'`.as("transaction_type"),
        account_key: deposits.account_key,
        reference: deposits.source_reference,
        wallet_key: deposits.source_wallet_key,
        currency_code: deposits.currency_code,
        amount: deposits.amount,
        status: deposits.status,
        date_created: deposits.date_created,
      }).from(deposits).orderBy(desc(deposits.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'withdrawal'`.as("transaction_type"),
        account_key: withdrawals.account_key,
        reference: withdrawals.source_reference,
        wallet_key: withdrawals.source_wallet_key,
        currency_code: withdrawals.currency_code,
        amount: withdrawals.amount,
        status: withdrawals.status,
        date_created: withdrawals.date_created,
      }).from(withdrawals).orderBy(desc(withdrawals.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'transfer'`.as("transaction_type"),
        account_key: transfers.account_key,
        reference: transfers.source_reference,
        wallet_key: transfers.source_wallet_key,
        currency_code: transfers.currency_code,
        amount: transfers.amount,
        status: transfers.status,
        date_created: transfers.date_created,
      }).from(transfers).orderBy(desc(transfers.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'swap'`.as("transaction_type"),
        account_key: swaps.account_key,
        reference: swaps.source_from_reference,
        wallet_key: swaps.source_from_wallet_key,
        currency_code: swaps.source_currency_code,
        amount: swaps.source_amount,
        status: swaps.status,
        date_created: swaps.date_created,
      }).from(swaps).orderBy(desc(swaps.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'ngn_deposit'`.as("transaction_type"),
        account_key: sql`NULL`.as("account_key"),
        reference: ngnDeposits.deposit_reference,
        wallet_key: ngnDeposits.wallet_key,
        currency_code: sql`'NGN'`.as("currency_code"),
        amount: ngnDeposits.amount,
        status: ngnDeposits.credit_status,
        date_created: ngnDeposits.date_created,
      }).from(ngnDeposits).orderBy(desc(ngnDeposits.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'ngn_payout'`.as("transaction_type"),
        account_key: ngnPayouts.account_key,
        reference: ngnPayouts.live_reference,
        wallet_key: ngnPayouts.source_wallet_key,
        currency_code: sql`'NGN'`.as("currency_code"),
        amount: ngnPayouts.amount,
        status: ngnPayouts.payout_status,
        date_created: ngnPayouts.date_created,
      }).from(ngnPayouts).orderBy(desc(ngnPayouts.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'crypto_deposit'`.as("transaction_type"),
        account_key: sql`NULL`.as("account_key"),
        reference: cryptoDeposits.deposit_reference,
        wallet_key: cryptoDeposits.wallet_key,
        currency_code: sql`NULL`.as("currency_code"),
        amount: cryptoDeposits.amount,
        status: cryptoDeposits.credit_status,
        date_created: cryptoDeposits.date_created,
      }).from(cryptoDeposits).orderBy(desc(cryptoDeposits.date_created)).limit(perSource),
      db.select({
        transaction_type: sql`'crypto_payout'`.as("transaction_type"),
        account_key: cryptoPayouts.account_key,
        reference: cryptoPayouts.live_reference,
        wallet_key: cryptoPayouts.source_wallet_key,
        currency_code: cryptoPayouts.asset,
        amount: cryptoPayouts.amount,
        status: cryptoPayouts.payout_status,
        date_created: cryptoPayouts.date_created,
      }).from(cryptoPayouts).orderBy(desc(cryptoPayouts.date_created)).limit(perSource),
    ]);

    const allRows = [...depRows, ...wdrRows, ...trfRows, ...swpRows, ...ngnDepRows, ...ngnPayRows, ...cDepRows, ...cPayRows];

    const filtered = allRows.filter((row) => {
      if (filters.account_key && row.account_key !== filters.account_key) return false;
      if (filters.wallet_key && row.wallet_key !== filters.wallet_key) return false;
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

    filtered.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

    return {
      count: filtered.length,
      rows: filtered.slice(offset, offset + limit),
    };
  }
}
