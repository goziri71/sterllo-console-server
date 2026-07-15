import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq, or } from "drizzle-orm";
import { authDb } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { generateToken } from "../utils/jwt/index.js";
import { clearUserCache } from "../utils/userCache.js";
import { loadUserAccess } from "./rbac.js";
import { pickPrimaryRoleSlug } from "../config/roles.js";
import {
  validateCrosslinkToken,
  extractCrosslinkIdentifiers,
} from "./redbillerCrosslink.js";

const SALT_ROUNDS = 6;

export default class AuthService {
  _generateUserKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  _sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  /** Same shape as getProfile: RBAC roles + permission keys for API clients. */
  _userWithAccess(userRow, access) {
    const safe = this._sanitizeUser(userRow);
    return {
      ...safe,
      roles: access.roleSlugs,
      permissions: [...access.permissionKeys],
      role: pickPrimaryRoleSlug(access.roleSlugs) ?? safe.role ?? null,
    };
  }

  async register({ email, password, first_name, last_name }) {
    const [existingUser] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw new ErrorClass("Email already registered", 409);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userValues = {
      user_key: this._generateUserKey(),
      email,
      password: hashedPassword,
      first_name,
      last_name,
      role: null,
      date_created: new Date(),
    };

    const result = await authDb.insert(users).values(userValues);
    const insertId = result[0].insertId;

    const [newUser] = await authDb
      .select()
      .from(users)
      .where(eq(users.id, insertId))
      .limit(1);

    const access = await loadUserAccess(newUser.id);
    const token = generateToken({
      id: newUser.id,
      user_key: newUser.user_key,
      token_version: newUser.token_version,
      roles: access.roleSlugs,
    });

    return {
      user: this._userWithAccess(newUser, access),
      token,
    };
  }

  /**
   * Login with email and password
   */
  async login({ email, password }) {
    const invalidFields = [];

    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      invalidFields.push("email");
    }

    if (user) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        invalidFields.push("password");
      }
    }

    if (invalidFields.length > 0) {
      throw new ErrorClass(
        `Invalid credentials: ${invalidFields.join(", ")}`,
        401
      );
    }

    const newTokenVersion = (user.token_version || 0) + 1;

    await authDb
      .update(users)
      .set({ last_login: new Date(), date_modified: new Date(), token_version: newTokenVersion })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    const access = await loadUserAccess(user.id);
    const token = generateToken({
      id: user.id,
      user_key: user.user_key,
      token_version: newTokenVersion,
      roles: access.roleSlugs,
    });

    return {
      user: this._userWithAccess({ ...user, token_version: newTokenVersion }, access),
      token,
    };
  }

  async _findUserByCrosslinkIdentifiers({ billerId, email }) {
    const matchConditions = [];
    if (billerId) matchConditions.push(eq(users.biller_id, billerId));
    if (email) matchConditions.push(eq(users.email, email));

    if (matchConditions.length === 0) {
      return null;
    }

    const whereClause =
      matchConditions.length === 1 ? matchConditions[0] : or(...matchConditions);

    const [user] = await authDb
      .select()
      .from(users)
      .where(whereClause)
      .limit(1);

    return user ?? null;
  }

  /**
   * Login via Redbiller crosslink token (SSO).
   * User must already exist in the auth DB (matched by biller_id or email).
   */
  async loginCrosslink({ token }) {
    const result = await validateCrosslinkToken(token);
    const data = result.data;

    if (!data) {
      throw new ErrorClass("Service temporarily down", 500);
    }

    const responseCode = data.code ?? data.data?.code;
    if (responseCode === 7010) {
      throw new ErrorClass("Crosslink has been used", 401);
    }

    if (result.success === false) {
      throw new ErrorClass(
        result.message || "Crosslink validation failed",
        result.status >= 400 && result.status < 600 ? result.status : 502,
      );
    }

    const { billerId, email, sessionID, userKey } =
      extractCrosslinkIdentifiers(data);

    if (!billerId && !email) {
      throw new ErrorClass("missing identifier", 422);
    }

    const user = await this._findUserByCrosslinkIdentifiers({ billerId, email });

    if (!user) {
      throw new ErrorClass("User not provisioned. Contact admin", 404);
    }

    const newTokenVersion = (user.token_version || 0) + 1;

    await authDb
      .update(users)
      .set({
        last_login: new Date(),
        date_modified: new Date(),
        token_version: newTokenVersion,
      })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    const access = await loadUserAccess(user.id);
    const jwt = generateToken({
      id: user.id,
      user_key: user.user_key,
      token_version: newTokenVersion,
      roles: access.roleSlugs,
    });

    return {
      user: this._userWithAccess({ ...user, token_version: newTokenVersion }, access),
      token: jwt,
      authToken: jwt,
      sessionID,
      userKey,
    };
  }

  /**
   * Change password (requires current password)
   */
  async changePassword({ userKey, currentPassword, newPassword }) {
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.user_key, userKey))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      throw new ErrorClass("Current password is incorrect", 401);
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new ErrorClass(
        "New password must be different from current password",
        400
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const newTokenVersion = (user.token_version || 0) + 1;

    await authDb
      .update(users)
      .set({ password: hashedPassword, date_modified: new Date(), token_version: newTokenVersion })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    return { message: "Password changed successfully" };
  }

  /**
   * Logout - invalidates the current token by incrementing token_version
   */
  async logout(userKey) {
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.user_key, userKey))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    await authDb
      .update(users)
      .set({ token_version: (user.token_version || 0) + 1, date_modified: new Date() })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    return { message: "Logged out successfully" };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    const access = await loadUserAccess(userId);
    return this._userWithAccess(user, access);
  }
}
