/**
 * Role definitions and permissions for the console dashboard.
 * Each department has specific read/update access.
 */

export const ROLES = {
  FINANCE: "finance",
  OPERATIONS: "operations",
  OPS_SUPPORT: "ops_support",
  COMPLIANCE: "compliance",
  GROWTH: "growth",
};

export const ALL_ROLES = Object.values(ROLES);

/** Roles that can update resources */
export const UPDATE_ROLES = [ROLES.OPERATIONS, ROLES.COMPLIANCE];

/** Roles that can update KYC specifically */
export const KYC_UPDATE_ROLES = [ROLES.COMPLIANCE];

/** Roles that can update disputes */
export const DISPUTE_UPDATE_ROLES = [ROLES.OPERATIONS, ROLES.COMPLIANCE];

/** Roles that can update overdrafts */
export const OVERDRAFT_UPDATE_ROLES = [ROLES.OPERATIONS];

/** Roles that can update merchants */
export const MERCHANT_UPDATE_ROLES = [ROLES.OPERATIONS, ROLES.COMPLIANCE];

/** Roles that can update customers */
export const CUSTOMER_UPDATE_ROLES = [ROLES.OPERATIONS, ROLES.COMPLIANCE];
