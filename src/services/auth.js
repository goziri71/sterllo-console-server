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

export default class AuthService {
  constructor() {
    this.mfa = new MfaSecurityService();
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
    const isCrosslink = context?.source === "crosslink";
    const session = await this.mfa.createSingleDeviceSession(
      user.id,
      isCrosslink ? `crosslink_${authMethod}` : authMethod,
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
      amr: isCrosslink
        ? ["crosslink", "mfa", authMethod]
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

    return this._beginMandatoryMfa(
      user,
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
