/**
 * Role definitions and permissions for the console dashboard.
 * Each department has specific read/update access.
 */

export const ROLES = {
  MANAGEMENT: "management",
  FINANCE: "finance",
  OPERATIONS: "operations",
  OPS_SUPPORT: "ops_support",
  COMPLIANCE: "compliance",
  GROWTH: "growth",
};

export const ALL_ROLES = Object.values(ROLES);

/** When a user has multiple RBAC roles, prefer this order for UI / legacy `role` field. */
const PRIMARY_ROLE_PRIORITY = [
  ROLES.MANAGEMENT,
  ROLES.FINANCE,
  ROLES.OPERATIONS,
  ROLES.OPS_SUPPORT,
  ROLES.COMPLIANCE,
  ROLES.GROWTH,
];

/**
 * Single role string for display and backwards compatibility (e.g. replaces stale `Users.role`).
 * @param {string[] | undefined} roleSlugs
 * @returns {string | null}
 */
export function pickPrimaryRoleSlug(roleSlugs) {
  const list = Array.isArray(roleSlugs) ? roleSlugs : [];
  const set = new Set(list);
  for (const slug of PRIMARY_ROLE_PRIORITY) {
    if (set.has(slug)) return slug;
  }
  return list[0] ?? null;
}

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
