/**
 * Fine-grained console permissions (stored in auth DB).
 * Management receives the `*` permission (full access).
 */

export const PERMISSIONS = {
  ALL: "*",
  RBAC_MANAGE: "rbac.manage",
  /** Balances, transaction amounts, settlement totals, finance/growth volume metrics, dashboard money fields. */
  FINANCIAL_READ: "financial.read",
  PRICING_READ: "pricing.read",
  PRICING_MANAGE: "pricing.manage",
  CONSOLE_READ: "console.read",
  CUSTOMER_UPDATE: "customer.update",
  MERCHANT_UPDATE: "merchant.update",
  KYC_UPDATE: "kyc.update",
  DISPUTE_UPDATE: "dispute.update",
  OVERDRAFT_UPDATE: "overdraft.update",
  CONFIG_WHITELIST_UPDATE: "config.whitelist.update",
};
