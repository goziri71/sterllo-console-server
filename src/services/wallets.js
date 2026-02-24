import { eq, and, desc, count, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants, merchantLedgers } from "../db/schema/merchants.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ngnDepositAccountNumbers } from "../db/schema/ngnAccounts.js";
import { cryptoDepositAddresses } from "../db/schema/cryptoInfra.js";
import { ErrorClass } from "../utils/errorClass/index.js";

async function getLatestClosingBalanceByWallet(walletKeys) {
  if (walletKeys.length === 0) return new Map();

  const walletKeyList = sql.join(walletKeys.map((k) => sql`${k}`), sql`,`);

  const [rows] = await db.execute(sql`
    SELECT wallet_key, closing_balance, date_created
    FROM (
      SELECT
        wallet_key,
        closing_balance,
        date_created,
        ROW_NUMBER() OVER (PARTITION BY wallet_key ORDER BY date_created DESC) AS rn
      FROM (
        SELECT source_wallet_key AS wallet_key, source_closing_balance AS closing_balance, date_created
        FROM Deposits
        WHERE source_wallet_key IN (${walletKeyList}) AND source_closing_balance IS NOT NULL

        UNION ALL
        SELECT target_wallet_key AS wallet_key, target_closing_balance AS closing_balance, date_created
        FROM Deposits
        WHERE target_wallet_key IN (${walletKeyList}) AND target_closing_balance IS NOT NULL

        UNION ALL
        SELECT source_wallet_key AS wallet_key, source_closing_balance AS closing_balance, date_created
        FROM Withdrawals
        WHERE source_wallet_key IN (${walletKeyList}) AND source_closing_balance IS NOT NULL

        UNION ALL
        SELECT target_wallet_key AS wallet_key, target_closing_balance AS closing_balance, date_created
        FROM Withdrawals
        WHERE target_wallet_key IN (${walletKeyList}) AND target_closing_balance IS NOT NULL

        UNION ALL
        SELECT source_wallet_key AS wallet_key, source_closing_balance AS closing_balance, date_created
        FROM Transfers
        WHERE source_wallet_key IN (${walletKeyList}) AND source_closing_balance IS NOT NULL

        UNION ALL
        SELECT target_wallet_key AS wallet_key, target_closing_balance AS closing_balance, date_created
        FROM Transfers
        WHERE target_wallet_key IN (${walletKeyList}) AND target_closing_balance IS NOT NULL

        UNION ALL
        SELECT source_from_wallet_key AS wallet_key, source_from_closing_balance AS closing_balance, date_created
        FROM Swaps
        WHERE source_from_wallet_key IN (${walletKeyList}) AND source_from_closing_balance IS NOT NULL

        UNION ALL
        SELECT source_to_wallet_key AS wallet_key, source_to_closing_balance AS closing_balance, date_created
        FROM Swaps
        WHERE source_to_wallet_key IN (${walletKeyList}) AND source_to_closing_balance IS NOT NULL

        UNION ALL
        SELECT target_from_wallet_key AS wallet_key, target_from_closing_balance AS closing_balance, date_created
        FROM Swaps
        WHERE target_from_wallet_key IN (${walletKeyList}) AND target_from_closing_balance IS NOT NULL

        UNION ALL
        SELECT target_to_wallet_key AS wallet_key, target_to_closing_balance AS closing_balance, date_created
        FROM Swaps
        WHERE target_to_wallet_key IN (${walletKeyList}) AND target_to_closing_balance IS NOT NULL

        UNION ALL
        SELECT wallet_key, closing_balance, date_created
        FROM NGNDeposits
        WHERE wallet_key IN (${walletKeyList}) AND closing_balance IS NOT NULL

        UNION ALL
        SELECT source_wallet_key AS wallet_key, closing_balance, date_created
        FROM NGNPayouts
        WHERE source_wallet_key IN (${walletKeyList}) AND closing_balance IS NOT NULL

        UNION ALL
        SELECT wallet_key, closing_balance, date_created
        FROM CryptocurrencyDeposits
        WHERE wallet_key IN (${walletKeyList}) AND closing_balance IS NOT NULL

        UNION ALL
        SELECT source_wallet_key AS wallet_key, closing_balance, date_created
        FROM CryptocurrencyPayouts
        WHERE source_wallet_key IN (${walletKeyList}) AND closing_balance IS NOT NULL
      ) all_tx
    ) ranked
    WHERE rn = 1
  `);

  const balanceRows = Array.isArray(rows) ? rows : [];
  const balanceMap = new Map();

  for (const row of balanceRows) {
    balanceMap.set(row.wallet_key, {
      current_balance: String(row.closing_balance),
      balance_last_updated: row.date_created,
    });
  }

  return balanceMap;
}

function formatNgnAccount(acc) {
  return {
    identifier: acc.identifier,
    wallet_key: acc.wallet_key,
    bank_name: acc.bank_name,
    bank_code: acc.bank_code,
    bank_slug: acc.bank_slug,
    account_name: acc.account_name,
    account_number: acc.account_number,
    type: acc.type,
    service: acc.service,
    is_pnd: acc.is_pnd,
    is_pnc: acc.is_pnc,
    is_deactivated: acc.is_deactivated,
    vendor: acc.vendor,
    reference: acc.reference,
    date_created: acc.date_created,
  };
}

function formatCryptoAddress(addr) {
  return {
    identifier: addr.identifier,
    wallet_key: addr.wallet_key,
    asset: addr.asset,
    network: addr.network,
    address_name: addr.address_name,
    address: addr.address,
    type: addr.type,
    service: addr.service,
    vendor: addr.vendor,
    vendor_wallet_id: addr.vendor_wallet_id,
    reference: addr.reference,
    date_created: addr.date_created,
  };
}

async function enrichWalletsByWalletKey(walletRows) {
  if (walletRows.length === 0) return walletRows;

  return Promise.all(
    walletRows.map(async (wallet) => {
      const [ngnAccounts, cryptoAddresses] = await Promise.all([
        db
          .select()
          .from(ngnDepositAccountNumbers)
          .where(eq(ngnDepositAccountNumbers.wallet_key, wallet.wallet_key))
          .orderBy(desc(ngnDepositAccountNumbers.date_created)),
        db
          .select()
          .from(cryptoDepositAddresses)
          .where(eq(cryptoDepositAddresses.wallet_key, wallet.wallet_key))
          .orderBy(desc(cryptoDepositAddresses.date_created)),
      ]);

      return {
        ...wallet,
        ngn_deposit_accounts: ngnAccounts.map(formatNgnAccount),
        crypto_deposit_addresses: cryptoAddresses.map(formatCryptoAddress),
      };
    })
  );
}

async function enrichMerchantWallets(walletRows, accountKey) {
  if (walletRows.length === 0) return walletRows;

  const walletKeys = walletRows.map((w) => w.wallet_key);

  const [allNgnAccounts, allCryptoAddresses, balanceByWallet] = await Promise.all([
    db
      .select()
      .from(ngnDepositAccountNumbers)
      .where(eq(ngnDepositAccountNumbers.account_key, accountKey))
      .orderBy(desc(ngnDepositAccountNumbers.date_created)),
    db
      .select()
      .from(cryptoDepositAddresses)
      .where(eq(cryptoDepositAddresses.account_key, accountKey))
      .orderBy(desc(cryptoDepositAddresses.date_created)),
    getLatestClosingBalanceByWallet(walletKeys),
  ]);

  const ngnByWallet = new Map();
  for (const acc of allNgnAccounts) {
    const key = acc.wallet_key;
    if (!ngnByWallet.has(key)) ngnByWallet.set(key, []);
    ngnByWallet.get(key).push(formatNgnAccount(acc));
  }

  const cryptoByWallet = new Map();
  for (const addr of allCryptoAddresses) {
    const key = addr.wallet_key;
    if (!cryptoByWallet.has(key)) cryptoByWallet.set(key, []);
    cryptoByWallet.get(key).push(formatCryptoAddress(addr));
  }

  return walletRows.map((wallet) => ({
    ...wallet,
    current_balance: balanceByWallet.get(wallet.wallet_key)?.current_balance ?? "0.00",
    balance_last_updated: balanceByWallet.get(wallet.wallet_key)?.balance_last_updated ?? null,
    balance_source: "derived_from_latest_closing_balance",
    ngn_deposit_accounts: ngnByWallet.get(wallet.wallet_key) || [],
    crypto_deposit_addresses: cryptoByWallet.get(wallet.wallet_key) || [],
  }));
}

export default class WalletService {
  async getMerchantWallets(accountKey, { limit, offset }) {
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
      db
        .select()
        .from(merchantLedgers)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(merchantLedgers.date_created)),
      db.select({ total: count() }).from(merchantLedgers).where(where),
    ]);

    const enrichedRows = await enrichMerchantWallets(rows, accountKey);
    return { count: Number(total), rows: enrichedRows };
  }

  async getMerchantWallet(accountKey, walletKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const [wallet] = await db
      .select()
      .from(merchantLedgers)
      .where(
        and(
          eq(merchantLedgers.account_key, accountKey),
          eq(merchantLedgers.wallet_key, walletKey)
        )
      )
      .limit(1);

    if (!wallet) {
      throw new ErrorClass("Wallet not found", 404);
    }

    const [ngnAccounts, cryptoAddresses, balanceByWallet] = await Promise.all([
      db
        .select()
        .from(ngnDepositAccountNumbers)
        .where(
          and(
            eq(ngnDepositAccountNumbers.account_key, accountKey),
            eq(ngnDepositAccountNumbers.wallet_key, walletKey)
          )
        )
        .orderBy(desc(ngnDepositAccountNumbers.date_created)),
      db
        .select()
        .from(cryptoDepositAddresses)
        .where(
          and(
            eq(cryptoDepositAddresses.account_key, accountKey),
            eq(cryptoDepositAddresses.wallet_key, walletKey)
          )
        )
        .orderBy(desc(cryptoDepositAddresses.date_created)),
      getLatestClosingBalanceByWallet([walletKey]),
    ]);

    return {
      ...wallet,
      current_balance: balanceByWallet.get(wallet.wallet_key)?.current_balance ?? "0.00",
      balance_last_updated: balanceByWallet.get(wallet.wallet_key)?.balance_last_updated ?? null,
      balance_source: "derived_from_latest_closing_balance",
      ngn_deposit_accounts: ngnAccounts.map(formatNgnAccount),
      crypto_deposit_addresses: cryptoAddresses.map(formatCryptoAddress),
    };
  }

  async getEnrichedCustomerWallets(identifier, { limit, offset }) {
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
      db
        .select()
        .from(customerWallets)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(customerWallets.date_created)),
      db.select({ total: count() }).from(customerWallets).where(where),
    ]);

    const enrichedRows = await enrichWalletsByWalletKey(rows);
    return { count: Number(total), rows: enrichedRows };
  }

  async getCustomerWalletDetail(identifier, walletKey) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const [wallet] = await db
      .select()
      .from(customerWallets)
      .where(
        and(
          eq(customerWallets.identifier, identifier),
          eq(customerWallets.wallet_key, walletKey)
        )
      )
      .limit(1);

    if (!wallet) {
      throw new ErrorClass("Wallet not found", 404);
    }

    const [enriched] = await enrichWalletsByWalletKey([wallet]);
    return enriched;
  }
}
