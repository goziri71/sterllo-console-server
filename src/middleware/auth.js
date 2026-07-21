import { eq } from "drizzle-orm";
import { ErrorClass } from "../utils/errorClass/index.js";
import { verifyToken } from "../utils/jwt/index.js";
import { authDb } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { getCachedUser, setCachedUser } from "../utils/userCache.js";
import { loadUserAccess } from "../services/rbac.js";
import { PERMISSIONS } from "../config/permissions.js";
import { pickPrimaryRoleSlug } from "../config/roles.js";
import { env } from "../config/env.js";
import MfaSecurityService from "../services/mfaSecurity.js";

export { clearUserCache } from "../utils/userCache.js";

/**
 * Authenticate - Fastify preHandler hook
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ErrorClass("Access denied. No token provided", 401);
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    const code = error.code || "";
    if (code === "FAST_JWT_MALFORMED" || code === "FAST_JWT_INVALID_SIGNATURE") {
      throw new ErrorClass("Invalid token", 401);
    }
    if (code === "FAST_JWT_EXPIRED") {
      throw new ErrorClass("Token expired", 401);
    }
    if (code.startsWith("FAST_JWT_")) {
      throw new ErrorClass("Invalid token", 401);
    }
    throw error;
  }

  const methods = Array.isArray(decoded.amr) ? decoded.amr : [];
  if (!decoded.sid || !methods.includes("mfa")) {
    throw new ErrorClass("Authenticated session required", 401);
  }

  const mfaSecurity = new MfaSecurityService();
  const session = await mfaSecurity.getActiveSession(decoded.sid, decoded.id);
  if (!session) {
    throw new ErrorClass("Session has expired or been revoked. Please login again", 401);
  }

  let user = getCachedUser(decoded.user_key);

  if (!user) {
    const [row] = await authDb
      .select()
      .from(users)
      .where(eq(users.user_key, decoded.user_key))
      .limit(1);

    if (!row) {
      throw new ErrorClass("User no longer exists", 401);
    }

    const { password, ...safeUser } = row;
    user = safeUser;

    setCachedUser(decoded.user_key, user);
  }

  if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
    throw new ErrorClass("Token has been revoked. Please login again", 401);
  }

  const access = await loadUserAccess(user.id);

  request.user = {
    ...user,
    roleSlugs: access.roleSlugs,
    permissionKeys: access.permissionKeys,
    role: pickPrimaryRoleSlug(access.roleSlugs) ?? user.role ?? null,
  };
  request.authSession = session;

  if (
    !session.last_seen_at ||
    Date.now() - session.last_seen_at.getTime() > 5 * 60 * 1000
  ) {
    await mfaSecurity.touchSession(session.id);
  }
};

export const requireRecentMfa = async (request) => {
  if (!request.authSession) {
    throw new ErrorClass("Access denied. Not authenticated", 401);
  }
  const verifiedAt = request.authSession.mfa_verified_at;
  const maxAgeMs = env.MFA_RECENT_WINDOW_MINUTES * 60 * 1000;
  if (!verifiedAt || Date.now() - verifiedAt.getTime() > maxAgeMs) {
    throw new ErrorClass("Recent MFA verification required", 403, {
      code: "recent_mfa_required",
    });
  }
};

/**
 * Require at least one of the given permission keys, or global * (management).
 */
export const requirePermission = (...requiredKeys) => {
  return async (request, reply) => {
    if (!request.user) {
      throw new ErrorClass("Access denied. Not authenticated", 401);
    }
    const perms = request.user.permissionKeys;
    if (!perms || !(perms instanceof Set)) {
      throw new ErrorClass("Access denied. Insufficient permissions", 403);
    }
    if (perms.has(PERMISSIONS.ALL)) return;
    const ok = requiredKeys.some((k) => perms.has(k));
    if (!ok) {
      throw new ErrorClass("Access denied. Insufficient permissions", 403);
    }
  };
};

/** Management (full access *) or explicit rbac.manage permission. */
export const requireRbacManage = async (request, reply) => {
  if (!request.user) {
    throw new ErrorClass("Access denied. Not authenticated", 401);
  }
  const perms = request.user.permissionKeys;
  if (perms.has(PERMISSIONS.ALL) || perms.has(PERMISSIONS.RBAC_MANAGE)) return;
  throw new ErrorClass("Access denied. Insufficient permissions", 403);
};

/**
 * @deprecated Use requirePermission with PERMISSIONS.* instead.
 */
export const authorize = (...allowedRoles) => {
  return async (request, reply) => {
    if (!request.user) {
      throw new ErrorClass("Access denied. Not authenticated", 401);
    }
    const slugs = request.user.roleSlugs || [];
    if (request.user.permissionKeys?.has(PERMISSIONS.ALL)) return;
    const ok = allowedRoles.some((r) => slugs.includes(r));
    if (!ok) {
      throw new ErrorClass("Access denied. Insufficient permissions", 403);
    }
  };
};
