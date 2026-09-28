import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers, customerWallets } from "../db/schema/customers.js";
import { ngnPayouts } from "../db/schema/fiat.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { parseReportDate } from "../utils/reportFilters.js";
import SettlementService from "./settlements.js";
import TransactionService from "./transactions.js";

const settlementService = new SettlementService();
const transactionService = new TransactionService();

function toFilters(filters) {
  return {
    account_key: filters.account_key,
    identifier: filters.identifier,
    currency_code: filters.currency_code,
    status: filters.status,
    search: filters.search,
    wallet_key: filters.wallet_key,
    from_date: filters.from_date,
    to_date: filters.to_date,
  };
}

function reportMeta(filters, report_type, row_count) {
  return {
    report_type,
    from_date: filters.from_date,
    to_date: filters.to_date,
    account_key: filters.account_key,
    identifier: filters.identifier,
    row_count,
    generated_at: new Date().toISOString(),
  };
}

export default class ReportsService {
  async settlementReport(filters) {
    const f = toFilters(filters);
    const [summary, batches] = await Promise.all([
      settlementService.getSummary(f),
      settlementService.getBatches({ limit: filters.limit, offset: 0, filters: f }),
    ]);
    return {
      meta: reportMeta(filters, "settlement", batches.rows.length),
      summary,
      rows: batches.rows,
    };
  }

  async transactionReport(filters) {
    const f = toFilters(filters);
    const { rows } = await transactionService.getStatement({
      limit: filters.limit,
      offset: 0,
      filters: f,
    });
    return {
      meta: reportMeta(filters, "transactions", rows.length),
      rows,
    };
  }

  async depositReport(filters) {
    const f = toFilters(filters);
    const { rows } = await transactionService.getDeposits({
      limit: filters.limit,
      offset: 0,
      filters: f,
    });
    return {
      meta: reportMeta(filters, "deposits", rows.length),
      rows,
    };
  }

  async transferReport(filters) {
    const f = toFilters(filters);
    const { rows } = await transactionService.getTransfers({
      limit: filters.limit,
      offset: 0,
      filters: f,
    });
    return {
      meta: reportMeta(filters, "transfers", rows.length),
      rows,
    };
  }

  async customerBalancesReport(filters) {
    const conditions = [];
    if (filters.account_key) {
      conditions.push(eq(customers.account_key, filters.account_key));
    }
    if (filters.identifier) {
      conditions.push(eq(customerWallets.identifier, filters.identifier));
    }
    if (filters.currency_code) {
      conditions.push(eq(customerWallets.currency_code, filters.currency_code));
    }

    const where =
      conditions.length > 0 ? and(...conditions) : undefined;

    const walletRows = await db
      .select({
        identifier: customerWallets.identifier,
        account_key: customers.account_key,
        wallet_key: customerWallets.wallet_key,
        currency_code: customerWallets.currency_code,
        customer_status: customers.status,
      })
      .from(customerWallets)
      .innerJoin(customers, eq(customers.identifier, customerWallets.identifier))
      .where(where)
      .limit(filters.limit);

    const walletKeys = walletRows.map((r) => r.wallet_key).filter(Boolean);
    if (walletKeys.length === 0) {
      return {
        meta: reportMeta(filters, "customer_balances", 0),
        rows: [],
      };
    }

    const walletKeyList = sql.join(walletKeys.map((k) => sql`${k}`), sql`,`);
    const [balanceRows] = await db.execute(sql`
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
          SELECT target_wallet_key, target_closing_balance, date_created
          FROM Deposits
          WHERE target_wallet_key IN (${walletKeyList}) AND target_closing_balance IS NOT NULL
          UNION ALL
          SELECT source_wallet_key, source_closing_balance, date_created
          FROM Transfers
          WHERE source_wallet_key IN (${walletKeyList}) AND source_closing_balance IS NOT NULL
          UNION ALL
          SELECT target_wallet_key, target_closing_balance, date_created
          FROM Transfers
          WHERE target_wallet_key IN (${walletKeyList}) AND target_closing_balance IS NOT NULL
          UNION ALL
          SELECT wallet_key, closing_balance, date_created
          FROM NGNDeposits
          WHERE wallet_key IN (${walletKeyList}) AND closing_balance IS NOT NULL
        ) movements
      ) ranked
      WHERE rn = 1
    `);

    const balanceMap = new Map(
      (balanceRows || []).map((row) => [
        row.wallet_key,
        { current_balance: row.closing_balance, balance_as_at: row.date_created },
      ]),
    );

    const rows = walletRows.map((w) => {
      const bal = balanceMap.get(w.wallet_key);
      return {
        ...w,
        current_balance: bal?.current_balance ?? null,
        balance_as_at: bal?.balance_as_at ?? null,
      };
    });

    return {
      meta: reportMeta(filters, "customer_balances", rows.length),
      rows,
    };
  }

  async openingClosingReport(filters) {
    const { rows: statementRows } = await this.transactionReport(filters);
    const byWallet = new Map();

    for (const row of statementRows) {
      const key = row.wallet_key || row.counterpart_wallet_key;
      if (!key) continue;
      const existing = byWallet.get(key) || {
        wallet_key: key,
        identifier: row.identifier || filters.identifier || null,
        account_key: row.account_key || filters.account_key || null,
        currency_code: row.currency_code || null,
        opening_balance: null,
        closing_balance: null,
        first_movement_at: null,
        last_movement_at: null,
      };

      const created = row.date_created ? new Date(row.date_created) : null;
      if (created && (!existing.first_movement_at || created < new Date(existing.first_movement_at))) {
        existing.first_movement_at = row.date_created;
        if (row.opening_balance != null) existing.opening_balance = row.opening_balance;
      }
      if (created && (!existing.last_movement_at || created > new Date(existing.last_movement_at))) {
        existing.last_movement_at = row.date_created;
        if (row.closing_balance != null) existing.closing_balance = row.closing_balance;
      }
      byWallet.set(key, existing);
    }

    const rows = [...byWallet.values()];
    return {
      meta: reportMeta(filters, "opening_closing_balances", rows.length),
      rows,
    };
  }

  async balanceSnapshotReport(filters) {
    return this.customerBalancesReport(filters);
  }

  async vatReport(filters) {
    const fromDate = parseReportDate(filters.from_date, "from_date");
    const toDate = parseReportDate(filters.to_date, "to_date");
    const movementConditions = [];
    if (fromDate) movementConditions.push(sql`date_created >= ${fromDate}`);
    if (toDate) movementConditions.push(sql`date_created <= ${toDate}`);
    if (filters.account_key) {
      movementConditions.push(sql`account_key = ${filters.account_key}`);
    }
    const movementWhere =
      movementConditions.length > 0
        ? sql`${sql.join(movementConditions, sql` AND `)}`
        : sql`1=1`;

    const ngnConditions = [];
    if (fromDate) ngnConditions.push(sql`date_created >= ${fromDate}`);
    if (toDate) ngnConditions.push(sql`date_created <= ${toDate}`);
    const ngnWhere =
      ngnConditions.length > 0
        ? sql`${sql.join(ngnConditions, sql` AND `)}`
        : sql`1=1`;

    const [rows] = await db.execute(sql`
      SELECT currency_code, SUM(vat_amount) AS total_vat, COUNT(*) AS line_count
      FROM (
        SELECT currency_code,
          COALESCE(CAST(source_vat AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(target_vat AS DECIMAL(30,8)), 0) AS vat_amount
        FROM Transfers
        WHERE ${movementWhere}
        UNION ALL
        SELECT currency_code,
          COALESCE(CAST(source_vat AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(target_vat AS DECIMAL(30,8)), 0)
        FROM Deposits
        WHERE ${movementWhere}
        UNION ALL
        SELECT 'NGN' AS currency_code,
          COALESCE(CAST(vat AS DECIMAL(30,8)), 0)
        FROM NGNDeposits
        WHERE ${ngnWhere}
      ) lines
      GROUP BY currency_code
      ORDER BY currency_code
    `);

    const detail = (rows || []).map((r) => ({
      currency_code: r.currency_code,
      total_vat: Number(r.total_vat || 0),
      line_count: Number(r.line_count || 0),
    }));

    return {
      meta: reportMeta(filters, "vat", detail.length),
      rows: detail,
    };
  }

  async vendorsReport(filters) {
    const fromDate = parseReportDate(filters.from_date, "from_date");
    const toDate = parseReportDate(filters.to_date, "to_date");

    const payoutConditions = [];
    if (fromDate) payoutConditions.push(gte(ngnPayouts.date_created, fromDate));
    if (toDate) payoutConditions.push(lte(ngnPayouts.date_created, toDate));
    if (filters.account_key) {
      payoutConditions.push(eq(ngnPayouts.account_key, filters.account_key));
    }
    const payoutWhere =
      payoutConditions.length > 0 ? and(...payoutConditions) : undefined;

    const grouped = await db
      .select({
        vendor: sql`COALESCE(${ngnPayouts.vendor}, 'unknown')`.as("vendor"),
        payout_count: sql`COUNT(*)`.as("payout_count"),
        total_amount: sql`SUM(COALESCE(CAST(${ngnPayouts.amount} AS DECIMAL(30,8)), 0))`.as(
          "total_amount",
        ),
        total_charge: sql`SUM(COALESCE(CAST(${ngnPayouts.charge} AS DECIMAL(30,8)), 0))`.as(
          "total_charge",
        ),
      })
      .from(ngnPayouts)
      .where(payoutWhere)
      .groupBy(sql`COALESCE(${ngnPayouts.vendor}, 'unknown')`)
      .orderBy(sql`total_amount DESC`)
      .limit(filters.limit);

    const rows = grouped;

    const detail = (rows || []).map((r) => ({
      vendor: r.vendor,
      payout_count: Number(r.payout_count || 0),
      total_amount: Number(r.total_amount || 0),
      total_charge: Number(r.total_charge || 0),
    }));

    return {
      meta: reportMeta(filters, "vendors", detail.length),
      rows: detail,
    };
  }

  async revenueReport(filters) {
    const fromDate = parseReportDate(filters.from_date, "from_date");
    const toDate = parseReportDate(filters.to_date, "to_date");
    const dateClause = [];
    if (fromDate) dateClause.push(sql`date_created >= ${fromDate}`);
    if (toDate) dateClause.push(sql`date_created <= ${toDate}`);
    if (filters.account_key) dateClause.push(sql`account_key = ${filters.account_key}`);
    const where =
      dateClause.length > 0
        ? sql`${sql.join(dateClause, sql` AND `)}`
        : sql`1=1`;

    const [rows] = await db.execute(sql`
      SELECT account_key, currency_code,
        SUM(fee_amount) AS total_revenue,
        COUNT(*) AS transaction_count
      FROM (
        SELECT account_key, currency_code,
          COALESCE(CAST(source_charge AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(custom_source_charge AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(target_charge AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(custom_target_charge AS DECIMAL(30,8)), 0) AS fee_amount,
          date_created
        FROM Transfers
        WHERE ${where}
        UNION ALL
        SELECT account_key, currency_code,
          COALESCE(CAST(source_charge AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(custom_source_charge AS DECIMAL(30,8)), 0)
          + COALESCE(CAST(target_charge AS DECIMAL(30,8)), 0),
          date_created
        FROM Withdrawals
        WHERE ${where}
      ) fees
      GROUP BY account_key, currency_code
      ORDER BY total_revenue DESC
      LIMIT ${filters.limit}
    `);

    const detail = (rows || []).map((r) => ({
      account_key: r.account_key,
      currency_code: r.currency_code,
      total_revenue: Number(r.total_revenue || 0),
      transaction_count: Number(r.transaction_count || 0),
    }));

    return {
      meta: reportMeta(filters, "revenue", detail.length),
      rows: detail,
    };
  }

  async growthRevenueByMerchant(filters) {
    const report = await this.revenueReport(filters);
    return {
      meta: { ...report.meta, report_type: "growth_revenue_by_merchant" },
      rows: report.rows,
    };
  }

  async growthCustomerExport(filters) {
    const scope = String(filters.scope || "all").toLowerCase();
    if (!["all", "active"].includes(scope)) {
      throw new ErrorClass("scope must be all or active", 400);
    }

    const conditions = [];
    const fromDate = parseReportDate(filters.from_date, "from_date");
    const toDate = parseReportDate(filters.to_date, "to_date");
    if (fromDate) conditions.push(gte(customers.date_created, fromDate));
    if (toDate) conditions.push(lte(customers.date_created, toDate));
    if (filters.account_key) conditions.push(eq(customers.account_key, filters.account_key));
    if (scope === "active") conditions.push(eq(customers.status, "active"));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        identifier: customers.identifier,
        account_key: customers.account_key,
        environment: customers.environment,
        type: customers.type,
        first_name: customers.first_name,
        surname: customers.surname,
        business_name: customers.business_name,
        email_address: customers.email_address,
        phone_number: customers.phone_number,
        status: customers.status,
        tier: customers.tier,
        date_created: customers.date_created,
      })
      .from(customers)
      .where(where)
      .limit(filters.limit);

    return {
      meta: reportMeta(filters, `growth_customers_${scope}`, rows.length),
      rows,
    };
  }
}
