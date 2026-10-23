import { eq } from "drizzle-orm";
import { authDb } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { generateToken } from "../utils/jwt/index.js";
import { clearUserCache } from "../utils/userCache.js";
import { loadUserAccess } from "./rbac.js";
import { pickPrimaryRoleSlug } from "../config/roles.js";
import { env } from "../config/env.js";
import MfaSecurityService from "./mfaSecurity.js";
import {
  alphaClientBasicLogin,
  alphaClientMfaEnrollConfirm,
  alphaClientMfaVerify,
  assertAlphaAccountMfaEnabled,
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

  async _issueVerifiedSession(userId, authMethod, context, metadata) {
    const user = await this._userById(userId);
    const access = await loadUserAccess(user.id);
    const isAlpha = context?.source === "alpha";
    const session = await this.mfa.createSingleDeviceSession(
      user.id,
      isAlpha ? "alpha" : authMethod,
      metadata,
    );
    await authDb
      .update(users)
      .set({ last_login: new Date(), date_modified: new Date() })
      .where(eq(users.id, user.id));
    clearUserCache(user.user_key);

    const amr = isAlpha ? ["alpha"] : ["mfa", authMethod];

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

  async _provisionedUserByEmail(normalizedEmail) {
    const [user] = await authDb
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not provisioned. Contact admin", 404);
    }
    return user;
  }

  async _finishLoginAfterAlpha({ email, alphaResult, metadata }) {
    assertAlphaAccountMfaEnabled(alphaResult.decrypted);

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = await this._provisionedUserByEmail(normalizedEmail);
    const ctx = alphaResult.context || {};

    if (user.auth_provider !== "alpha") {
      await authDb
        .update(users)
        .set({ auth_provider: "alpha", date_modified: new Date() })
        .where(eq(users.id, user.id));
    }

    return this._issueVerifiedSession(
      user.id,
      "alpha",
      {
        source: "alpha",
        sessionID: ctx.sessionID,
        userKey: ctx.userKey,
      },
      metadata,
    );
  }

  _alphaMfaChallengeResponse({ phase, challengeToken, alphaContext }) {
    const expiresIn = env.MFA_CHALLENGE_TTL_SECONDS;
    if (phase === "mfa_enroll") {
      return {
        state: "mfa_enrollment_required",
        challenge_token: challengeToken,
        expires_in: expiresIn,
        provider: "alpha",
        factor: alphaContext?.otpauthUri
          ? {
              type: "totp",
              otpauth_uri: alphaContext.otpauthUri,
            }
          : { type: "totp" },
      };
    }
    return {
      state: "mfa_required",
      challenge_token: challengeToken,
      expires_in: expiresIn,
      provider: "alpha",
      methods: ["totp"],
    };
  }

  /**
   * Login: Alpha Basic (email/password) → Alpha MFA if required → local Users check → JWT.
   */
  async loginWithPassword({ email, password, metadata }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail)) {
      throw new ErrorClass("A valid email is required", 400);
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      throw new ErrorClass("password is required", 400);
    }

    const alpha = await alphaClientBasicLogin({
      email: normalizedEmail,
      password,
      clientContext: metadata,
    });

    if (alpha.phase === "authenticated") {
      return this._finishLoginAfterAlpha({
        email: normalizedEmail,
        alphaResult: alpha,
        metadata,
      });
    }

    const purpose =
      alpha.phase === "mfa_enroll"
        ? "alpha_mfa_enroll"
        : "alpha_mfa";

    const challengeToken = await this.mfa.createAlphaMfaChallenge(
      normalizedEmail,
      alpha.context,
      purpose,
      metadata,
    );

    return this._alphaMfaChallengeResponse({
      phase: alpha.phase,
      challengeToken,
      alphaContext: alpha.context,
    });
  }

  async confirmMfaEnrollment({ challengeToken, code, metadata }) {
    const { email, alphaContext, clientContext } = await this.mfa.consumeAlphaMfaChallenge(
      challengeToken,
      "alpha_mfa_enroll",
    );
    const alpha = await alphaClientMfaEnrollConfirm({
      email,
      code,
      alphaContext,
      clientContext: { ...clientContext, ...metadata },
    });
    if (alpha.phase !== "authenticated") {
      throw new ErrorClass("Alpha MFA enrollment not completed", 401);
    }
    return this._finishLoginAfterAlpha({
      email,
      alphaResult: alpha,
      metadata,
    });
  }

  async completeMfaLogin({ challengeToken, code, recoveryCode, metadata }) {
    if (recoveryCode) {
      throw new ErrorClass(
        "Recovery codes are managed in Alpha account security, not on console login",
        400,
      );
    }
    const { email, alphaContext, clientContext } = await this.mfa.consumeAlphaMfaChallenge(
      challengeToken,
      "alpha_mfa",
    );
    const alpha = await alphaClientMfaVerify({
      email,
      code,
      alphaContext,
      clientContext: { ...clientContext, ...metadata },
    });
    if (alpha.phase !== "authenticated") {
      throw new ErrorClass("Alpha MFA verification failed", 401);
    }
    return this._finishLoginAfterAlpha({
      email,
      alphaResult: alpha,
      metadata,
    });
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
