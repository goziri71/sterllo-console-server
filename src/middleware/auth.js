import { eq } from "drizzle-orm";
import { ErrorClass } from "../utils/errorClass/index.js";
import { verifyToken } from "../utils/jwt/index.js";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";

/**
 * In-memory user cache
 * TTL: 5 minutes -- avoids hitting DB on every request
 * Keyed by user_key from the JWT payload
 */
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUser(userKey) {
  const entry = userCache.get(userKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    userCache.delete(userKey);
    return null;
  }
  return entry.user;
}

function setCachedUser(userKey, user) {
  userCache.set(userKey, { user, cachedAt: Date.now() });
}

export function clearUserCache(userKey) {
  if (userKey) {
    userCache.delete(userKey);
  } else {
    userCache.clear();
  }
}

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
    // fast-jwt error codes (used by @fastify/jwt)
    const code = error.code || "";
    if (code === "FAST_JWT_MALFORMED" || code === "FAST_JWT_INVALID_SIGNATURE") {
      throw new ErrorClass("Invalid token", 401);
    }
    if (code === "FAST_JWT_EXPIRED") {
      throw new ErrorClass("Token expired", 401);
    }
    // Fallback for any other JWT-related error
    if (code.startsWith("FAST_JWT_")) {
      throw new ErrorClass("Invalid token", 401);
    }
    throw error;
  }

  // Check cache first, then DB
  let user = getCachedUser(decoded.user_key);

  if (!user) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.user_key, decoded.user_key))
      .limit(1);

    if (!row) {
      throw new ErrorClass("User no longer exists", 401);
    }

    // Exclude password from cached/returned user
    const { password, ...safeUser } = row;
    user = safeUser;

    setCachedUser(decoded.user_key, user);
  }

  request.user = user;
};

/**
 * Authorize - returns a Fastify preHandler hook
 * Usage: { preHandler: authorize("finance", "operations") }
 */
export const authorize = (...allowedRoles) => {
  return async (request, reply) => {
    if (!request.user) {
      throw new ErrorClass("Access denied. Not authenticated", 401);
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ErrorClass("Access denied. Insufficient permissions", 403);
    }
  };
};
