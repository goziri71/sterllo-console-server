import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { ErrorClass } from "../utils/errorClass/index.js";

function normalizeStatus(status) {
  const raw = String(status || "").toLowerCase();
  if (["success", "completed", "settled"].includes(raw)) return "completed";
  if (["processing", "in_progress", "in-progress"].includes(raw)) return "processing";
  if (["queued", "pending"].includes(raw)) return "pending";
  if (["failed", "error", "reversed"].includes(raw)) return "failed";
  return raw || "pending";
}

function statusFilterClause(status) {
  const value = String(status || "").toLowerCase();
  if (!value) return null;

  if (value === "completed" || value === "settled") {
    return sql`LOWER(COALESCE(t.status, '')) IN ('success','completed','settled')`;
  }
  if (value === "processing") {
    return sql`LOWER(COALESCE(t.status, '')) IN ('processing','in_progress','in-progress')`;
  }
  if (value === "pending") {
    return sql`LOWER(COALESCE(t.status, '')) IN ('pending','queued')`;
  }
  if (value === "failed") {
    return sql`LOWER(COALESCE(t.status, '')) IN ('failed','error','reversed')`;
  }
  return sql`LOWER(COALESCE(t.status, '')) = ${value}`;
}

const settlementMovementClause = sql`(
  (
    sm.wallet_key IS NOT NULL
    AND ts.wallet_key IS NOT NULL
    AND t.account_key IS NOT NULL
    AND sm.account_key = t.account_key
    AND ts.account_key = t.account_key
  )
  OR
  (
    ss.wallet_key IS NOT NULL
    AND tm.wallet_key IS NOT NULL
    AND t.account_key IS NOT NULL
    AND ss.account_key = t.account_key
    AND tm.account_key = t.account_key
  )
)`;

function buildWhere(filters = {}) {
  const conditions = [
    settlementMovementClause,
  ];

  if (filters.account_key) {
    conditions.push(sql`t.account_key = ${filters.account_key}`);
  }
  if (filters.currency_code) {
    conditions.push(sql`t.currency_code = ${filters.currency_code}`);
  }
  if (filters.from_date) {
    conditions.push(sql`t.date_created >= ${new Date(filters.from_date)}`);
  }
  if (filters.to_date) {
    conditions.push(sql`t.date_created <= ${new Date(filters.to_date)}`);
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      sql`(
        t.source_reference LIKE ${pattern}
        OR t.target_reference LIKE ${pattern}
        OR t.source_wallet_key LIKE ${pattern}
        OR t.target_wallet_key LIKE ${pattern}
        OR t.account_key LIKE ${pattern}
      )`,
    );
  }

  const statusClause = statusFilterClause(filters.status);
  if (statusClause) {
    conditions.push(statusClause);
  }

  return sql`${sql.join(conditions, sql` AND `)}`;
}

const feeExpr = sql`(
  COALESCE(CAST(t.source_charge AS DECIMAL(30,8)), 0)
  + COALESCE(CAST(t.custom_source_charge AS DECIMAL(30,8)), 0)
  + COALESCE(CAST(t.target_charge AS DECIMAL(30,8)), 0)
  + COALESCE(CAST(t.custom_target_charge AS DECIMAL(30,8)), 0)
)`;

const amountExpr = sql`COALESCE(CAST(t.amount AS DECIMAL(30,8)), 0)`;
const netExpr = sql`(${amountExpr} - ${feeExpr})`;

const settlementTypeExpr = sql`CASE
  WHEN sm.wallet_key IS NOT NULL AND ts.wallet_key IS NOT NULL THEN 'Merchant Settlement'
  WHEN ss.wallet_key IS NOT NULL AND tm.wallet_key IS NOT NULL THEN 'Ledger To Merchant Wallet'
  ELSE 'Internal Ledger Settlement'
END`;

const fromClause = sql`
  FROM Transfers t
  LEFT JOIN MerchantLedgers sm ON sm.wallet_key = t.source_wallet_key
  LEFT JOIN MerchantLedgers tm ON tm.wallet_key = t.target_wallet_key
  LEFT JOIN SettlementLedgers ss ON ss.wallet_key = t.source_wallet_key
  LEFT JOIN SettlementLedgers ts ON ts.wallet_key = t.target_wallet_key
`;

export default class SettlementService {
  async getSummary(filters = {}) {
    const where = buildWhere(filters);
    const [rows] = await db.execute(sql`
      SELECT
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('pending','queued') THEN ${netExpr} ELSE 0 END) AS pending_total,
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('processing','in_progress','in-progress') THEN ${netExpr} ELSE 0 END) AS processing_total,
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('failed','error','reversed') THEN ${netExpr} ELSE 0 END) AS failed_total,
        SUM(CASE WHEN LOWER(COALESCE(t.status, '')) IN ('success','completed','settled') THEN ${netExpr} ELSE 0 END) AS settled_total
      ${fromClause}
      WHERE ${where}
    `);

    const summary = rows?.[0] || {};
    return {
      pending_total: Number(summary.pending_total || 0),
      processing_total: Number(summary.processing_total || 0),
      failed_total: Number(summary.failed_total || 0),
      settled_total: Number(summary.settled_total || 0),
    };
  }

  async getBatches({ limit, offset, filters }) {
    const where = buildWhere(filters);
    const [[{ total }], rowsResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS total
        ${fromClause}
        WHERE ${where}
      `),
      db.execute(sql`
        SELECT
          COALESCE(t.source_reference, t.target_reference, CAST(t.id AS CHAR)) AS batch_id,
          ${settlementTypeExpr} AS settlement_type,
          t.account_key,
          t.source_wallet_key,
          t.target_wallet_key,
          t.currency_code,
          ${amountExpr} AS gross_amount,
          ${feeExpr} AS fees_deducted,
          ${netExpr} AS net_payable,
          t.status AS status,
          t.date_created
        ${fromClause}
        WHERE ${where}
        ORDER BY t.date_created DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const rows = (rowsResult?.[0] || rowsResult || []).map((row) => ({
      ...row,
      status: normalizeStatus(row.status),
      gross_amount: Number(row.gross_amount || 0),
      fees_deducted: Number(row.fees_deducted || 0),
      net_payable: Number(row.net_payable || 0),
    }));

    return { count: Number(total || 0), rows };
  }

  async getBatch(batchId) {
    const [rows] = await db.execute(sql`
      SELECT
        t.id,
        COALESCE(t.source_reference, t.target_reference, CAST(t.id AS CHAR)) AS batch_id,
        ${settlementTypeExpr} AS settlement_type,
        t.account_key,
        t.source_wallet_key,
        t.target_wallet_key,
        t.currency_code,
        ${amountExpr} AS gross_amount,
        ${feeExpr} AS fees_deducted,
        ${netExpr} AS net_payable,
        t.status AS status,
        t.message,
        t.source_reference,
        t.target_reference,
        t.date_created,
        t.date_modified
      ${fromClause}
      WHERE (
        ${settlementMovementClause}
      )
      AND (
        COALESCE(t.source_reference, t.target_reference, CAST(t.id AS CHAR)) = ${batchId}
      )
      LIMIT 1
    `);

    const batch = (rows?.[0] || null);
    if (!batch) {
      throw new ErrorClass("Settlement batch not found", 404);
    }

    return {
      ...batch,
      status: normalizeStatus(batch.status),
      gross_amount: Number(batch.gross_amount || 0),
      fees_deducted: Number(batch.fees_deducted || 0),
      net_payable: Number(batch.net_payable || 0),
    };
  }
}
