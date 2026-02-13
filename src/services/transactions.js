import { eq, and, between, gte, lte, desc, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { deposits, withdrawals, transfers, swaps } from "../db/schema/transactions.js";
import { ngnDeposits, ngnPayouts } from "../db/schema/fiat.js";
import { cryptoDeposits, cryptoPayouts } from "../db/schema/crypto.js";

/**
 * Build an array of Drizzle conditions from common transaction filters.
 */
function buildConditions(table, filters, hasAccountKey = true) {
  const conditions = [];

  if (hasAccountKey && filters.account_key) {
    conditions.push(eq(table.account_key, filters.account_key));
  }
  if (filters.wallet_key) {
    conditions.push(eq(table.source_wallet_key, filters.wallet_key));
  }
  if (filters.status) {
    conditions.push(eq(table.status, filters.status));
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
      where: buildConditions(swaps, filters),
      limit,
      offset,
    });
  }

  async getNGNDeposits({ limit, offset, filters }) {
    const conditions = [];
    if (filters.wallet_key) conditions.push(eq(ngnDeposits.wallet_key, filters.wallet_key));
    if (filters.status) conditions.push(eq(ngnDeposits.credit_status, filters.status));
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
    return paginated(ngnPayouts, {
      where: buildConditions(ngnPayouts, filters),
      limit,
      offset,
    });
  }

  async getCryptoDeposits({ limit, offset, filters }) {
    const conditions = [];
    if (filters.wallet_key) conditions.push(eq(cryptoDeposits.wallet_key, filters.wallet_key));
    if (filters.status) conditions.push(eq(cryptoDeposits.credit_status, filters.status));
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
    return paginated(cryptoPayouts, {
      where: buildConditions(cryptoPayouts, filters),
      limit,
      offset,
    });
  }
}
