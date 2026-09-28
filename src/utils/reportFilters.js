import { ErrorClass } from "./errorClass/index.js";

export const REPORT_MAX_ROWS = 5000;

export function parseReportDate(value, fieldName) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ErrorClass(`Invalid ${fieldName}`, 400);
  }
  return d;
}

export function extractReportFilters(query = {}) {
  const from_date = query.from_date || null;
  const to_date = query.to_date || null;
  if (from_date) parseReportDate(from_date, "from_date");
  if (to_date) parseReportDate(to_date, "to_date");

  const limitRaw = query.limit != null ? Number(query.limit) : REPORT_MAX_ROWS;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(1, Math.floor(limitRaw)), REPORT_MAX_ROWS)
    : REPORT_MAX_ROWS;

  return {
    account_key: query.account_key || null,
    identifier: query.identifier || null,
    currency_code: query.currency_code || null,
    status: query.status || null,
    search: query.search || null,
    wallet_key: query.wallet_key || null,
    from_date,
    to_date,
    format: String(query.format || "json").toLowerCase(),
    limit,
    scope: query.scope || null,
    min_amount: query.min_amount != null ? Number(query.min_amount) : null,
    window_ms: query.window_ms != null ? Number(query.window_ms) : 1000,
  };
}
