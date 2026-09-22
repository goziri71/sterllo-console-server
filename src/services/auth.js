import { eq } from "drizzle-orm";
import { authDb } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { generateToken } from "../utils/jwt/index.js";
import { clearUserCache } from "../utils/userCache.js";
import { loadUserAccess } from "./rbac.js";
import { pickPrimaryRoleSlug } from "../config/roles.js";
import MfaSecurityService from "./mfaSecurity.js";
import {
  alphaClientBasicLogin,
  extractAlphaLoginContext,
} from "./alphaAccountAuth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const isAlpha = context?.source === "alpha";
    const session = await this.mfa.createSingleDeviceSession(
      user.id,
      isAlpha ? `alpha_${authMethod}` : authMethod,
      metadata,
    );
    await authDb
      .update(users)
      .set({ last_login: new Date(), date_modified: new Date() })
      .where(eq(users.id, user.id));
    clearUserCache(user.user_key);

    const amr = isAlpha ? ["alpha", "mfa", authMethod] : ["mfa", authMethod];

    const token = generateToken({
      sub: String(user.id),
      id: user.id,
      user_key: user.user_key,
      token_version: user.token_version || 0,
      roles: access.roleSlugs,
      sid: session.id,
      amr,
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
    return response;
  }

  /**
   * Login: local Users check → Alpha Basic (email/password) → MFA.
   * Crosslink and email-OTP are removed.
   */
  async loginWithPassword({ email, password, metadata }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw new ErrorClass("A valid email is required", 400);
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      throw new ErrorClass("password is required", 400);
    }

    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not provisioned. Contact admin", 404);
    }

    const alpha = await alphaClientBasicLogin({
      email: normalizedEmail,
      password,
    });
    const { sessionID, userKey } = extractAlphaLoginContext(alpha.decrypted);

    if (user.auth_provider !== "alpha") {
      await authDb
        .update(users)
        .set({ auth_provider: "alpha", date_modified: new Date() })
        .where(eq(users.id, user.id));
      user.auth_provider = "alpha";
    }

    return this._beginMandatoryMfa(
      user,
      { source: "alpha", sessionID, userKey },
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

  async getProfile(userId) {
    const user = await this._userById(userId);
    const access = await loadUserAccess(user.id);
    return this._userWithAccess(user, access);
  }
}
