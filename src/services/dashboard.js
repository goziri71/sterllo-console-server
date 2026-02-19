import { count, desc, eq, ne, and, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { merchants, merchantLedgers } from "../db/schema/merchants.js";
import { deposits, withdrawals, transfers, swaps } from "../db/schema/transactions.js";
import { ngnDeposits, ngnPayouts } from "../db/schema/fiat.js";
import { cryptoDeposits, cryptoPayouts } from "../db/schema/crypto.js";
import { transactionDisputes } from "../db/schema/disputes.js";
import { overdraftRequests } from "../db/schema/overdrafts.js";
import { kycs } from "../db/schema/kycs.js";
import { ROLES } from "../config/roles.js";

const SUMMARY_CACHE_TTL_MS = 60_000;
const cache = new Map();

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff);
}

function countSince(table, dateCol, since) {
  return db
    .select({ total: count() })
    .from(table)
    .where(gte(dateCol, since));
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < SUMMARY_CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

async function getSharedOverview(today) {
  const [
    [{ total: totalCustomers }],
    [{ total: totalCustomerWallets }],
    [{ total: totalMerchantLedgers }],
    [{ total: depositsToday }],
    [{ total: withdrawalsToday }],
    [{ total: transfersToday }],
    [{ total: swapsToday }],
    [{ total: ngnDepositsToday }],
    [{ total: ngnPayoutsToday }],
    [{ total: cryptoDepositsToday }],
    [{ total: cryptoPayoutsToday }],
    [{ total: openDisputes }],
  ] = await Promise.all([
    db.select({ total: count() }).from(customers),
    db.select({ total: count() }).from(customerWallets),
    db.select({ total: count() }).from(merchantLedgers),
    countSince(deposits, deposits.date_created, today),
    countSince(withdrawals, withdrawals.date_created, today),
    countSince(transfers, transfers.date_created, today),
    countSince(swaps, swaps.date_created, today),
    countSince(ngnDeposits, ngnDeposits.date_created, today),
    countSince(ngnPayouts, ngnPayouts.date_created, today),
    countSince(cryptoDeposits, cryptoDeposits.date_created, today),
    countSince(cryptoPayouts, cryptoPayouts.date_created, today),
    db.select({ total: count() }).from(transactionDisputes).where(ne(transactionDisputes.status, "resolved")),
  ]);

  return {
    total_customers: Number(totalCustomers),
    total_wallets: Number(totalCustomerWallets) + Number(totalMerchantLedgers),
    transactions_today:
      Number(depositsToday) + Number(withdrawalsToday) + Number(transfersToday) + Number(swapsToday) +
      Number(ngnDepositsToday) + Number(ngnPayoutsToday) + Number(cryptoDepositsToday) + Number(cryptoPayoutsToday),
    open_disputes: Number(openDisputes),
    system_uptime_seconds: Math.floor(process.uptime()),
  };
}

async function getFinanceDepartment(today) {
  const [
    completedSettlement,
    pendingSettlement,
    currencyUsageRows,
    [{ total: ngnDepCount }],
    [{ total: ngnPayCount }],
  ] = await Promise.all([
    db.execute(
      sql`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(amount AS DECIMAL(20,2))), 0) as total_amount FROM NGNPayouts WHERE payout_status = 'successful' AND date_created >= ${today}`,
    ),
    db.execute(
      sql`SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(amount AS DECIMAL(20,2))), 0) as total_amount FROM NGNPayouts WHERE payout_status = 'pending'`,
    ),
    db.select({ currency_code: customerWallets.currency_code, wallet_count: count() })
      .from(customerWallets)
      .groupBy(customerWallets.currency_code)
      .orderBy(desc(count())),
    countSince(ngnDeposits, ngnDeposits.date_created, today),
    countSince(ngnPayouts, ngnPayouts.date_created, today),
  ]);

  const completedRow = Array.isArray(completedSettlement) ? completedSettlement[0] : completedSettlement;
  const pendingRow = Array.isArray(pendingSettlement) ? pendingSettlement[0] : pendingSettlement;

  return {
    role: ROLES.FINANCE,
    settlement_status: {
      completed_today_ngn: String(completedRow?.total_amount ?? "0.00"),
      pending_ngn: String(pendingRow?.total_amount ?? "0.00"),
      completed_today_count: Number(completedRow?.cnt ?? 0),
      pending_count: Number(pendingRow?.cnt ?? 0),
    },
    currency_usage: currencyUsageRows.map((r) => ({
      currency_code: r.currency_code,
      wallet_count: Number(r.wallet_count),
    })),
    total_ngn_deposits_today: Number(ngnDepCount),
    total_ngn_payouts_today: Number(ngnPayCount),
  };
}

async function getOperationsDepartment(today) {
  const [
    [{ total: openDisputes }],
    [{ total: pendingOverdrafts }],
    [{ total: transfersToday }],
    [{ total: ngnPayToday }],
    [{ total: ngnPayPending }],
    [{ total: cryptoPayToday }],
  ] = await Promise.all([
    db.select({ total: count() }).from(transactionDisputes).where(ne(transactionDisputes.status, "resolved")),
    db.select({ total: count() }).from(overdraftRequests).where(eq(overdraftRequests.status, "pending")),
    countSince(transfers, transfers.date_created, today),
    countSince(ngnPayouts, ngnPayouts.date_created, today),
    db.select({ total: count() }).from(ngnPayouts).where(eq(ngnPayouts.payout_status, "pending")),
    countSince(cryptoPayouts, cryptoPayouts.date_created, today),
  ]);

  return {
    role: ROLES.OPERATIONS,
    open_disputes: Number(openDisputes),
    pending_overdraft_requests: Number(pendingOverdrafts),
    transfers_today: Number(transfersToday),
    ngn_payouts_today: Number(ngnPayToday),
    ngn_payouts_pending: Number(ngnPayPending),
    crypto_payouts_today: Number(cryptoPayToday),
  };
}

async function getOpsSupportDepartment(today) {
  const week = startOfWeek();

  const [
    [{ total: onboardedToday }],
    [{ total: onboardedWeek }],
    [{ total: disputesFiledToday }],
    [{ total: disputesResolvedToday }],
  ] = await Promise.all([
    countSince(customers, customers.date_created, today),
    countSince(customers, customers.date_created, week),
    countSince(transactionDisputes, transactionDisputes.date_created, today),
    db.select({ total: count() }).from(transactionDisputes)
      .where(and(eq(transactionDisputes.status, "resolved"), gte(transactionDisputes.date_modified, today))),
  ]);

  return {
    role: ROLES.OPS_SUPPORT,
    customers_onboarded_today: Number(onboardedToday),
    customers_onboarded_this_week: Number(onboardedWeek),
    disputes_filed_today: Number(disputesFiledToday),
    disputes_resolved_today: Number(disputesResolvedToday),
  };
}

async function getComplianceDepartment() {
  const [
    [{ total: kycPending }],
    [{ total: idVerifPending }],
    [{ total: flaggedPnd }],
    [{ total: flaggedPnc }],
    [{ total: nonCompliantPersonal }],
    [{ total: nonCompliantBusiness }],
  ] = await Promise.all([
    db.select({ total: count() }).from(kycs).where(ne(kycs.is_compliant, "Y")),
    db.select({ total: count() }).from(kycs)
      .where(sql`${kycs.is_compliant} != 'Y' AND ${kycs.identification_type} IN ('NATIONAL_ID', 'DRIVERS_LICENSE', 'INTERNATIONAL_PASSPORT', 'VOTERS_CARD')`),
    db.select({ total: count() }).from(customers).where(eq(customers.is_pnd, "Y")),
    db.select({ total: count() }).from(customers).where(eq(customers.is_pnc, "Y")),
    db.select({ total: count() }).from(customers)
      .where(and(ne(customers.is_personal_compliant, "Y"), eq(customers.type, "PERSONAL"))),
    db.select({ total: count() }).from(customers)
      .where(and(ne(customers.is_business_compliant, "Y"), eq(customers.type, "BUSINESS"))),
  ]);

  return {
    role: ROLES.COMPLIANCE,
    kyc_pending_approval: Number(kycPending),
    id_verification_pending_approval: Number(idVerifPending),
    customers_flagged_pnd: Number(flaggedPnd),
    customers_flagged_pnc: Number(flaggedPnc),
    non_compliant_personal: Number(nonCompliantPersonal),
    non_compliant_business: Number(nonCompliantBusiness),
  };
}

async function getGrowthDepartment(today) {
  const week = startOfWeek();

  const [
    [{ total: onboardedToday }],
    [{ total: onboardedWeek }],
    [{ total: walletsToday }],
    [{ total: walletsWeek }],
    [{ total: activeMerchants }],
    currencyUsageRows,
  ] = await Promise.all([
    countSince(customers, customers.date_created, today),
    countSince(customers, customers.date_created, week),
    countSince(customerWallets, customerWallets.date_created, today),
    countSince(customerWallets, customerWallets.date_created, week),
    db.select({ total: count() }).from(merchants),
    db.select({ currency_code: customerWallets.currency_code, wallet_count: count() })
      .from(customerWallets)
      .groupBy(customerWallets.currency_code)
      .orderBy(desc(count())),
  ]);

  return {
    role: ROLES.GROWTH,
    customers_onboarded_today: Number(onboardedToday),
    customers_onboarded_this_week: Number(onboardedWeek),
    wallets_created_today: Number(walletsToday),
    wallets_created_this_week: Number(walletsWeek),
    active_merchants: Number(activeMerchants),
    currency_usage: currencyUsageRows.map((r) => ({
      currency_code: r.currency_code,
      wallet_count: Number(r.wallet_count),
    })),
  };
}

const departmentBuilders = {
  [ROLES.FINANCE]: getFinanceDepartment,
  [ROLES.OPERATIONS]: getOperationsDepartment,
  [ROLES.OPS_SUPPORT]: getOpsSupportDepartment,
  [ROLES.COMPLIANCE]: getComplianceDepartment,
  [ROLES.GROWTH]: getGrowthDepartment,
};

const ACTIVITY_TYPES_BY_ROLE = {
  [ROLES.FINANCE]: new Set([
    "ngn_deposit_received", "ngn_payout_processed",
    "crypto_deposit_received", "crypto_payout_processed",
    "transfer_processed",
  ]),
  [ROLES.OPERATIONS]: new Set([
    "dispute_created", "dispute_resolved",
    "transfer_processed", "ngn_payout_processed",
    "crypto_payout_processed", "overdraft_requested",
  ]),
  [ROLES.OPS_SUPPORT]: new Set([
    "customer_onboarded", "wallet_created",
    "dispute_created", "dispute_resolved",
  ]),
  [ROLES.COMPLIANCE]: new Set([
    "customer_onboarded", "kyc_submitted",
    "dispute_created", "dispute_resolved",
  ]),
  [ROLES.GROWTH]: new Set([
    "customer_onboarded", "wallet_created",
  ]),
};

export default class DashboardService {
  async getSummary(role) {
    const cacheKey = `summary_${role}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const today = startOfToday();

    const buildDepartment = departmentBuilders[role];
    const [overview, department] = await Promise.all([
      getSharedOverview(today),
      buildDepartment ? buildDepartment(today) : { role },
    ]);

    const result = { overview, department };

    setCache(cacheKey, result);
    return result;
  }

  async getActivities({ role, limit, offset }) {
    const perSource = limit + offset;
    const allowedTypes = ACTIVITY_TYPES_BY_ROLE[role];

    const queries = [];

    const needsCustomers = allowedTypes.has("customer_onboarded");
    const needsWallets = allowedTypes.has("wallet_created");
    const needsDisputes = allowedTypes.has("dispute_created") || allowedTypes.has("dispute_resolved");
    const needsTransfers = allowedTypes.has("transfer_processed");
    const needsNgnDeposits = allowedTypes.has("ngn_deposit_received");
    const needsNgnPayouts = allowedTypes.has("ngn_payout_processed");
    const needsCryptoDeposits = allowedTypes.has("crypto_deposit_received");
    const needsCryptoPayouts = allowedTypes.has("crypto_payout_processed");
    const needsOverdrafts = allowedTypes.has("overdraft_requested");
    const needsKycs = allowedTypes.has("kyc_submitted");

    if (needsCustomers) {
      queries.push(
        db.select({ first_name: customers.first_name, surname: customers.surname, identifier: customers.identifier, date_created: customers.date_created })
          .from(customers).orderBy(desc(customers.date_created)).limit(perSource)
          .then((rows) => rows.map((c) => ({
            type: "customer_onboarded",
            description: `New customer ${c.first_name || ""} ${c.surname || ""} onboarded`.trim(),
            reference: c.identifier,
            timestamp: c.date_created,
          }))),
      );
    }

    if (needsWallets) {
      queries.push(
        db.select({ wallet_key: customerWallets.wallet_key, currency_code: customerWallets.currency_code, date_created: customerWallets.date_created })
          .from(customerWallets).orderBy(desc(customerWallets.date_created)).limit(perSource)
          .then((rows) => rows.map((w) => ({
            type: "wallet_created",
            description: `Wallet created (${w.currency_code})`,
            reference: w.wallet_key,
            timestamp: w.date_created,
          }))),
      );
    }

    if (needsDisputes) {
      queries.push(
        db.select({ dispute_reference: transactionDisputes.dispute_reference, status: transactionDisputes.status, date_created: transactionDisputes.date_created, date_modified: transactionDisputes.date_modified })
          .from(transactionDisputes).orderBy(desc(transactionDisputes.date_created)).limit(perSource)
          .then((rows) => rows.map((d) => {
            const isResolved = d.status === "resolved";
            return {
              type: isResolved ? "dispute_resolved" : "dispute_created",
              description: isResolved ? `Dispute ${d.dispute_reference} resolved` : `Dispute ${d.dispute_reference} filed`,
              reference: d.dispute_reference,
              timestamp: isResolved ? d.date_modified : d.date_created,
            };
          })),
      );
    }

    if (needsTransfers) {
      queries.push(
        db.select({ source_reference: transfers.source_reference, amount: transfers.amount, currency_code: transfers.currency_code, date_created: transfers.date_created })
          .from(transfers).orderBy(desc(transfers.date_created)).limit(perSource)
          .then((rows) => rows.map((t) => ({
            type: "transfer_processed",
            description: `Transfer of ${t.amount} ${t.currency_code} processed`,
            reference: t.source_reference,
            timestamp: t.date_created,
          }))),
      );
    }

    if (needsNgnDeposits) {
      queries.push(
        db.select({ deposit_reference: ngnDeposits.deposit_reference, amount: ngnDeposits.amount, date_created: ngnDeposits.date_created })
          .from(ngnDeposits).orderBy(desc(ngnDeposits.date_created)).limit(perSource)
          .then((rows) => rows.map((nd) => ({
            type: "ngn_deposit_received",
            description: `NGN deposit of ${nd.amount} received`,
            reference: nd.deposit_reference,
            timestamp: nd.date_created,
          }))),
      );
    }

    if (needsNgnPayouts) {
      queries.push(
        db.select({ live_reference: ngnPayouts.live_reference, amount: ngnPayouts.amount, payout_status: ngnPayouts.payout_status, date_created: ngnPayouts.date_created })
          .from(ngnPayouts).orderBy(desc(ngnPayouts.date_created)).limit(perSource)
          .then((rows) => rows.map((np) => ({
            type: "ngn_payout_processed",
            description: `NGN payout of ${np.amount} ${np.payout_status || "processed"}`,
            reference: np.live_reference,
            timestamp: np.date_created,
          }))),
      );
    }

    if (needsCryptoDeposits) {
      queries.push(
        db.select({ deposit_reference: cryptoDeposits.deposit_reference, amount: cryptoDeposits.amount, date_created: cryptoDeposits.date_created })
          .from(cryptoDeposits).orderBy(desc(cryptoDeposits.date_created)).limit(perSource)
          .then((rows) => rows.map((cd) => ({
            type: "crypto_deposit_received",
            description: `Crypto deposit of ${cd.amount} received`,
            reference: cd.deposit_reference,
            timestamp: cd.date_created,
          }))),
      );
    }

    if (needsCryptoPayouts) {
      queries.push(
        db.select({ live_reference: cryptoPayouts.live_reference, amount: cryptoPayouts.amount, asset: cryptoPayouts.asset, date_created: cryptoPayouts.date_created })
          .from(cryptoPayouts).orderBy(desc(cryptoPayouts.date_created)).limit(perSource)
          .then((rows) => rows.map((cp) => ({
            type: "crypto_payout_processed",
            description: `Crypto payout of ${cp.amount} ${cp.asset || ""} processed`.trim(),
            reference: cp.live_reference,
            timestamp: cp.date_created,
          }))),
      );
    }

    if (needsOverdrafts) {
      queries.push(
        db.select({ reference: overdraftRequests.reference, amount: overdraftRequests.amount, status: overdraftRequests.status, date_created: overdraftRequests.date_created })
          .from(overdraftRequests).orderBy(desc(overdraftRequests.date_created)).limit(perSource)
          .then((rows) => rows.map((o) => ({
            type: "overdraft_requested",
            description: `Overdraft request of ${o.amount} (${o.status})`,
            reference: o.reference,
            timestamp: o.date_created,
          }))),
      );
    }

    if (needsKycs) {
      queries.push(
        db.select({ reference: kycs.reference, identification_type: kycs.identification_type, is_compliant: kycs.is_compliant, date_created: kycs.date_created })
          .from(kycs).orderBy(desc(kycs.date_created)).limit(perSource)
          .then((rows) => rows.map((k) => ({
            type: "kyc_submitted",
            description: `KYC ${k.identification_type} submitted (${k.is_compliant === "Y" ? "compliant" : "pending"})`,
            reference: k.reference,
            timestamp: k.date_created,
          }))),
      );
    }

    const results = await Promise.all(queries);
    const activities = results.flat();

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = activities.length;
    const paged = activities.slice(offset, offset + limit);

    return { count: total, rows: paged };
  }
}
