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
import MfaSecurityService from "./mfaSecurity.js";

const SALT_ROUNDS = 12;

export default class AuthService {
  constructor() {
    this.mfa = new MfaSecurityService();
  }

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

  async _userById(userId) {
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new ErrorClass("User not found", 404);
    return user;
  }

  async _beginMandatoryMfa(user, context, metadata) {
    const mfaState = await this.mfa.beginAuthentication(user, {
      context,
      metadata,
    });
    return {
      ...mfaState,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    };
  }

  async _issueVerifiedSession(userId, authMethod, context, metadata) {
    const user = await this._userById(userId);
    const access = await loadUserAccess(user.id);
    const session = await this.mfa.createSingleDeviceSession(
      user.id,
      authMethod,
      metadata,
    );
    await authDb
      .update(users)
      .set({ last_login: new Date(), date_modified: new Date() })
      .where(eq(users.id, user.id));
    clearUserCache(user.user_key);

    const token = generateToken({
      sub: String(user.id),
      id: user.id,
      user_key: user.user_key,
      token_version: user.token_version || 0,
      roles: access.roleSlugs,
      sid: session.id,
      amr:
        authMethod === "crosslink"
          ? ["crosslink"]
          : authMethod === "password"
            ? ["password"]
            : ["mfa", authMethod],
      mfa_verified_at: Math.floor(session.mfaVerifiedAt.getTime() / 1000),
    });

    const response = {
      state: "authenticated",
      user: this._userWithAccess(user, access),
      token,
      session: {
        id: session.id,
        expires_at: session.expiresAt,
        device_label: metadata.deviceLabel || null,
      },
    };
    if (context?.sessionID) response.sessionID = context.sessionID;
    if (context?.userKey) response.userKey = context.userKey;
    if (context?.source === "crosslink") {
      response.authToken = token;
    }
    return response;
  }

  async register({ email, password, first_name, last_name, metadata }) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existingUser] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      throw new ErrorClass("Unable to register with the supplied details", 409);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userValues = {
      user_key: this._generateUserKey(),
      email: normalizedEmail,
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

    return this._issueVerifiedSession(
      newUser.id,
      "password",
      { source: "registration" },
      metadata,
    );
  }

  /**
   * Login with email and password
   */
  async login({ email, password, metadata }) {
    const normalizedEmail = String(email).trim().toLowerCase();
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : false;
    if (!user || !isPasswordValid) {
      throw new ErrorClass("Invalid email or password", 401);
    }

    return this._issueVerifiedSession(
      user.id,
      "password",
      { source: "password" },
      metadata,
    );
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

    const matches = await authDb
      .select()
      .from(users)
      .where(whereClause)
      .limit(2);

    if (matches.length > 1) {
      throw new ErrorClass("Crosslink identity is ambiguous. Contact admin", 409);
    }
    const user = matches[0] ?? null;
    if (
      user &&
      billerId &&
      email &&
      user.biller_id &&
      user.email &&
      (String(user.biller_id) !== String(billerId) ||
        String(user.email).toLowerCase() !== String(email).toLowerCase())
    ) {
      throw new ErrorClass("Crosslink identity does not match the provisioned user", 401);
    }
    return user;
  }

  /**
   * Login via Redbiller crosslink token (SSO).
   * User must already exist in the auth DB (matched by biller_id or email).
   */
  async loginCrosslink({ token, metadata }) {
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

    // Crosslink-only auth: validate with Redbiller, then issue console JWT
    // immediately (same contract as the other working Crosslink backend).
    return this._issueVerifiedSession(
      user.id,
      "crosslink",
      { source: "crosslink", sessionID, userKey },
      metadata,
    );
  }

  async confirmMfaEnrollment({ challengeToken, code, metadata }) {
    const result = await this.mfa.confirmEnrollment({
      challengeToken,
      code,
      metadata,
    });
    const authenticated = await this._issueVerifiedSession(
      result.userId,
      result.authMethod,
      result.context,
      metadata,
    );
    return { ...authenticated, recovery_codes: result.recoveryCodes };
  }

  async completeMfaLogin({
    challengeToken,
    code,
    recoveryCode,
    metadata,
  }) {
    const result = await this.mfa.completeLoginChallenge({
      challengeToken,
      code,
      recoveryCode,
      metadata,
    });
    return this._issueVerifiedSession(
      result.userId,
      result.authMethod,
      result.context,
      metadata,
    );
  }

  /**
   * Change password (requires current password)
   */
  async changePassword({ userKey, currentPassword, newPassword, metadata }) {
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

    await this.mfa.revokeAllSessions(user.id, metadata, "password_changed");
    clearUserCache(user.user_key);

    return { message: "Password changed successfully" };
  }

  /**
   * Logout only the current device session.
   */
  async logout(userId, sessionId, metadata) {
    await this.mfa.revokeSession(sessionId, userId, metadata);
    return { message: "Logged out successfully" };
  }

  async logoutAll(userId, metadata) {
    const user = await this._userById(userId);
    await authDb
      .update(users)
      .set({
        token_version: (user.token_version || 0) + 1,
        date_modified: new Date(),
      })
      .where(eq(users.id, user.id));
    await this.mfa.revokeAllSessions(user.id, metadata);
    clearUserCache(user.user_key);
    return { message: "Logged out from all devices successfully" };
  }

  async listSessions(userId) {
    return this.mfa.listSessions(userId);
  }

  async regenerateRecoveryCodes(userId, code, metadata) {
    return this.mfa.regenerateRecoveryCodes(userId, code, metadata);
  }

  async verifyMfaStepUp(userId, sessionId, code, metadata) {
    return this.mfa.verifyStepUp(userId, sessionId, code, metadata);
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
