import { PERMISSIONS } from "../config/permissions.js";

export function userCanReadFinancial(user) {
  if (!user?.permissionKeys || !(user.permissionKeys instanceof Set)) return false;
  return user.permissionKeys.has(PERMISSIONS.ALL) || user.permissionKeys.has(PERMISSIONS.FINANCIAL_READ);
}

/** Keys whose values are treated as monetary / balance-like and redacted without `financial.read`. */
export function shouldRedactFinancialKey(key) {
  const k = String(key).toLowerCase();
  if (k === "amount" || k === "fee" || k === "total_amount" || k === "total_value") return true;
  if (k.includes("balance")) return true;
  if (k.endsWith("_amount")) return true;
  if (k.includes("volume")) return true;
  return false;
}

export function redactFinancialDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map((v) => redactFinancialDeep(v));
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (shouldRedactFinancialKey(k)) {
        out[k] = null;
      } else {
        out[k] = redactFinancialDeep(v);
      }
    }
    return out;
  }
  return value;
}

export function redactWalletBalanceFields(row) {
  if (!row || typeof row !== "object") return row;
  const next = { ...row };
  next.current_balance = null;
  next.balance_last_updated = null;
  next.balance_source = null;
  if ("last_activity_at" in next) next.last_activity_at = null;
  if (next.status === "active" || next.status === "inactive") next.status = null;
  return next;
}
