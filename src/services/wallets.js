import { eq, and, desc, count, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { merchants, merchantLedgers } from "../db/schema/merchants.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ngnDepositAccountNumbers } from "../db/schema/ngnAccounts.js";
import { cryptoDepositAddresses } from "../db/schema/cryptoInfra.js";
import { ErrorClass } from "../utils/errorClass/index.js";

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const WALLET_SUMMARY_CACHE_TTL_MS = 60_000;
const walletSummaryCache = new Map();

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

async function getPendingTransactionsByWallet(walletKeys) {
  if (walletKeys.length === 0) return new Map();

  const walletKeyList = sql.join(walletKeys.map((k) => sql`${k}`), sql`,`);
  const [rows] = await db.execute(sql`
    SELECT wallet_key, COUNT(*) as pending_count
    FROM (
      SELECT source_wallet_key AS wallet_key
      FROM Withdrawals
      WHERE source_wallet_key IN (${walletKeyList}) AND UPPER(status) = 'PENDING'

      UNION ALL
      SELECT source_wallet_key AS wallet_key
      FROM Transfers
      WHERE source_wallet_key IN (${walletKeyList}) AND UPPER(status) = 'PENDING'

      UNION ALL
      SELECT target_wallet_key AS wallet_key
      FROM Deposits
      WHERE target_wallet_key IN (${walletKeyList}) AND UPPER(status) = 'PENDING'

      UNION ALL
      SELECT wallet_key
      FROM NGNDeposits
      WHERE wallet_key IN (${walletKeyList}) AND UPPER(credit_status) = 'PENDING'

      UNION ALL
      SELECT source_wallet_key AS wallet_key
      FROM NGNPayouts
      WHERE source_wallet_key IN (${walletKeyList}) AND UPPER(payout_status) = 'PENDING'

      UNION ALL
      SELECT wallet_key
      FROM CryptocurrencyDeposits
      WHERE wallet_key IN (${walletKeyList}) AND UPPER(credit_status) = 'PENDING'

      UNION ALL
      SELECT source_wallet_key AS wallet_key
      FROM CryptocurrencyPayouts
      WHERE source_wallet_key IN (${walletKeyList}) AND UPPER(payout_status) = 'PENDING'
    ) pending_tx
    GROUP BY wallet_key
  `);

  const pendingRows = Array.isArray(rows) ? rows : [];
  const pendingMap = new Map();
  for (const row of pendingRows) {
    pendingMap.set(row.wallet_key, Number(row.pending_count));
  }
  return pendingMap;
}

function getCachedWalletSummary(key) {
  const cached = walletSummaryCache.get(key);
  if (cached && Date.now() - cached.time < WALLET_SUMMARY_CACHE_TTL_MS) return cached.data;
  return null;
}

function setCachedWalletSummary(key, data) {
  walletSummaryCache.set(key, { data, time: Date.now() });
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
  async getWalletPage({ ownerType, ownerKey, limit, offset, search, currencyCode, status }) {
    const normalizedOwnerType = ownerType ? String(ownerType).toLowerCase() : "all";
    const normalizedOwnerKey = ownerKey || "all";
    const normalizedStatus = status ? String(status).toLowerCase() : "all";
    const searchTerm = search ? String(search).trim() : null;
    const currencyFilter = currencyCode ? String(currencyCode).trim().toUpperCase() : null;

    if (!["merchant", "customer", "all"].includes(normalizedOwnerType)) {
      throw new ErrorClass("owner_type must be merchant, customer, or all", 400);
    }

    if (normalizedOwnerType !== "all" && (!normalizedOwnerKey || normalizedOwnerKey === "all")) {
      throw new ErrorClass("owner_key is required for merchant/customer owner_type", 400);
    }

    let baseRows = [];
    let totalCount = 0;

    if (normalizedOwnerType === "merchant") {
      const [merchantRows] = await db.execute(
        sql`SELECT account_key, name, trade_name FROM Merchants WHERE account_key = ${normalizedOwnerKey} LIMIT 1`,
      );
      const merchant = merchantRows?.[0];
      if (!merchant) throw new ErrorClass("Merchant not found", 404);

      const ownerName = merchant.trade_name || merchant.name || normalizedOwnerKey;

      const [countRows] = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM MerchantLedgers
        WHERE account_key = ${normalizedOwnerKey}
          AND (
            ${searchTerm} IS NULL
            OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR account_key LIKE CONCAT('%', ${searchTerm}, '%')
          )
          AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
      `);
      totalCount = Number(countRows?.[0]?.total || 0);

      const [rows] = await db.execute(sql`
        SELECT wallet_key, wallet_id, currency_code, date_created
        FROM MerchantLedgers
        WHERE account_key = ${normalizedOwnerKey}
          AND (
            ${searchTerm} IS NULL
            OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR account_key LIKE CONCAT('%', ${searchTerm}, '%')
          )
          AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
        ORDER BY date_created DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      baseRows = (rows || []).map((r) => ({
        owner_type: "merchant",
        owner_key: normalizedOwnerKey,
        owner_name: ownerName,
        country_name: null,
        country_code: null,
        wallet_key: r.wallet_key,
        wallet_id: r.wallet_id,
        currency_code: r.currency_code,
        date_created: r.date_created,
      }));
    } else if (normalizedOwnerType === "customer") {
      const [customerRows] = await db.execute(sql`
        SELECT identifier, first_name, surname, country_name, country_code
        FROM Customers
        WHERE identifier = ${normalizedOwnerKey}
        LIMIT 1
      `);
      const customer = customerRows?.[0];
      if (!customer) throw new ErrorClass("Customer not found", 404);

      const ownerName =
        `${customer.first_name || ""} ${customer.surname || ""}`.trim() || customer.identifier;

      const [countRows] = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM CustomerWallets
        WHERE identifier = ${normalizedOwnerKey}
          AND (
            ${searchTerm} IS NULL
            OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR identifier LIKE CONCAT('%', ${searchTerm}, '%')
          )
          AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
      `);
      totalCount = Number(countRows?.[0]?.total || 0);

      const [rows] = await db.execute(sql`
        SELECT wallet_key, wallet_id, currency_code, date_created
        FROM CustomerWallets
        WHERE identifier = ${normalizedOwnerKey}
          AND (
            ${searchTerm} IS NULL
            OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR identifier LIKE CONCAT('%', ${searchTerm}, '%')
          )
          AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
        ORDER BY date_created DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      baseRows = (rows || []).map((r) => ({
        owner_type: "customer",
        owner_key: normalizedOwnerKey,
        owner_name: ownerName,
        country_name: customer.country_name || null,
        country_code: customer.country_code || null,
        wallet_key: r.wallet_key,
        wallet_id: r.wallet_id,
        currency_code: r.currency_code,
        date_created: r.date_created,
      }));
    } else {
      const [countRows] = await db.execute(sql`
        SELECT COUNT(*) AS total
        FROM (
          SELECT
            ml.wallet_key,
            ml.wallet_id,
            ml.account_key AS owner_key,
            ml.currency_code,
            COALESCE(m.trade_name, m.name, ml.account_key) AS owner_name
          FROM MerchantLedgers ml
          LEFT JOIN Merchants m ON m.account_key = ml.account_key
          UNION ALL
          SELECT
            cw.wallet_key,
            cw.wallet_id,
            cw.identifier AS owner_key,
            cw.currency_code,
            TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.surname, ''))) AS owner_name
          FROM CustomerWallets cw
          LEFT JOIN Customers c ON c.identifier = cw.identifier
        ) w
        WHERE (
          ${searchTerm} IS NULL
          OR w.wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
          OR w.wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
          OR w.owner_key LIKE CONCAT('%', ${searchTerm}, '%')
          OR w.owner_name LIKE CONCAT('%', ${searchTerm}, '%')
        )
          AND (${currencyFilter} IS NULL OR w.currency_code = ${currencyFilter})
      `);
      totalCount = Number(countRows?.[0]?.total || 0);

      const [rows] = await db.execute(sql`
        SELECT *
        FROM (
          SELECT
            'merchant' AS owner_type,
            ml.account_key AS owner_key,
            COALESCE(m.trade_name, m.name, ml.account_key) AS owner_name,
            NULL AS country_name,
            NULL AS country_code,
            ml.wallet_key,
            ml.wallet_id,
            ml.currency_code,
            ml.date_created
          FROM MerchantLedgers ml
          LEFT JOIN Merchants m ON m.account_key = ml.account_key

          UNION ALL

          SELECT
            'customer' AS owner_type,
            cw.identifier AS owner_key,
            TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.surname, ''))) AS owner_name,
            c.country_name AS country_name,
            c.country_code AS country_code,
            cw.wallet_key,
            cw.wallet_id,
            cw.currency_code,
            cw.date_created
          FROM CustomerWallets cw
          LEFT JOIN Customers c ON c.identifier = cw.identifier
        ) w
        WHERE (
            ${searchTerm} IS NULL
            OR w.wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.owner_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.owner_name LIKE CONCAT('%', ${searchTerm}, '%')
          )
          AND (${currencyFilter} IS NULL OR w.currency_code = ${currencyFilter})
        ORDER BY w.date_created DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      baseRows = (rows || []).map((r) => ({
        owner_type: r.owner_type,
        owner_key: r.owner_key,
        owner_name: r.owner_name || r.owner_key,
        country_name: r.country_name || null,
        country_code: r.country_code || null,
        wallet_key: r.wallet_key,
        wallet_id: r.wallet_id,
        currency_code: r.currency_code,
        date_created: r.date_created,
      }));
    }

    const pageWalletKeys = baseRows.map((w) => w.wallet_key);
    const [balanceByWallet, pendingByWallet] = await Promise.all([
      getLatestClosingBalanceByWallet(pageWalletKeys),
      getPendingTransactionsByWallet(pageWalletKeys),
    ]);

    let rows = baseRows.map((wallet) => {
      const currentBalance = balanceByWallet.get(wallet.wallet_key)?.current_balance ?? "0.00";
      const lastActivityAt = balanceByWallet.get(wallet.wallet_key)?.balance_last_updated ?? null;
      const pendingCount = pendingByWallet.get(wallet.wallet_key) ?? 0;
      const derivedStatus = toNumber(currentBalance) > 0 ? "active" : "inactive";

      return {
        ...wallet,
        current_balance: String(currentBalance),
        pending_transactions_count: pendingCount,
        status: derivedStatus,
        last_activity_at: lastActivityAt,
        balance_source: "derived_from_latest_closing_balance",
      };
    });

    if (normalizedStatus !== "all") {
      rows = rows.filter((r) => r.status === normalizedStatus);
    }

    const summaryCacheKey = JSON.stringify({
      ownerType: normalizedOwnerType,
      ownerKey: normalizedOwnerKey,
      searchTerm,
      currencyFilter,
      normalizedStatus,
    });

    let summary = getCachedWalletSummary(summaryCacheKey);
    if (!summary) {
      let summaryWalletKeys = [];

      if (normalizedOwnerType === "merchant") {
        const [keyRows] = await db.execute(sql`
          SELECT wallet_key
          FROM MerchantLedgers
          WHERE account_key = ${normalizedOwnerKey}
            AND (
              ${searchTerm} IS NULL
              OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
              OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
              OR account_key LIKE CONCAT('%', ${searchTerm}, '%')
            )
            AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
        `);
        summaryWalletKeys = (keyRows || []).map((r) => r.wallet_key);
      } else if (normalizedOwnerType === "customer") {
        const [keyRows] = await db.execute(sql`
          SELECT wallet_key
          FROM CustomerWallets
          WHERE identifier = ${normalizedOwnerKey}
            AND (
              ${searchTerm} IS NULL
              OR wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
              OR wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
              OR identifier LIKE CONCAT('%', ${searchTerm}, '%')
            )
            AND (${currencyFilter} IS NULL OR currency_code = ${currencyFilter})
        `);
        summaryWalletKeys = (keyRows || []).map((r) => r.wallet_key);
      } else {
        const [keyRows] = await db.execute(sql`
          SELECT wallet_key
          FROM (
            SELECT
              ml.wallet_key,
              ml.wallet_id,
              ml.account_key AS owner_key,
              ml.currency_code,
              COALESCE(m.trade_name, m.name, ml.account_key) AS owner_name
            FROM MerchantLedgers ml
            LEFT JOIN Merchants m ON m.account_key = ml.account_key
            UNION ALL
            SELECT
              cw.wallet_key,
              cw.wallet_id,
              cw.identifier AS owner_key,
              cw.currency_code,
              TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.surname, ''))) AS owner_name
            FROM CustomerWallets cw
            LEFT JOIN Customers c ON c.identifier = cw.identifier
          ) w
          WHERE (
            ${searchTerm} IS NULL
            OR w.wallet_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.wallet_id LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.owner_key LIKE CONCAT('%', ${searchTerm}, '%')
            OR w.owner_name LIKE CONCAT('%', ${searchTerm}, '%')
          )
            AND (${currencyFilter} IS NULL OR w.currency_code = ${currencyFilter})
        `);
        summaryWalletKeys = (keyRows || []).map((r) => r.wallet_key);
      }

      const [summaryBalances, summaryPending] = await Promise.all([
        getLatestClosingBalanceByWallet(summaryWalletKeys),
        getPendingTransactionsByWallet(summaryWalletKeys),
      ]);

      const summaryRows = summaryWalletKeys.map((walletKey) => {
        const currentBalance = summaryBalances.get(walletKey)?.current_balance ?? "0.00";
        const rowStatus = toNumber(currentBalance) > 0 ? "active" : "inactive";
        return {
          wallet_key: walletKey,
          current_balance: currentBalance,
          status: rowStatus,
          pending_transactions_count: summaryPending.get(walletKey) ?? 0,
        };
      });

      const filteredSummaryRows =
        normalizedStatus === "all"
          ? summaryRows
          : summaryRows.filter((r) => r.status === normalizedStatus);

      summary = {
        total_wallets: filteredSummaryRows.length,
        total_value: filteredSummaryRows
          .reduce((sum, r) => sum + toNumber(r.current_balance), 0)
          .toFixed(2),
        active_wallets: filteredSummaryRows.filter((r) => r.status === "active").length,
        pending_transactions: filteredSummaryRows.reduce(
          (sum, r) => sum + Number(r.pending_transactions_count || 0),
          0,
        ),
      };

      setCachedWalletSummary(summaryCacheKey, summary);
    }

    const count =
      normalizedStatus === "all" ? totalCount : Number(summary.total_wallets || 0);

    return { summary, count, rows };
  }

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
