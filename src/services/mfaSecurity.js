import crypto from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import { authDb } from "../db/index.js";
import {
  authLoginChallenges,
  authMfaFactors,
  authMfaRecoveryCodes,
  authSecurityEvents,
  authSessions,
} from "../db/schema/authSecurity.js";
import { env } from "../config/env.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const CHALLENGE_PURPOSE = Object.freeze({
  ENROLL: "mfa_enroll",
  LOGIN: "mfa_login",
});

const SECURITY_EVENT = Object.freeze({
  CHALLENGE_CREATED: "mfa_challenge_created",
  CHALLENGE_FAILED: "mfa_challenge_failed",
  ENROLLED: "mfa_enrolled",
  LOGIN_VERIFIED: "mfa_login_verified",
  RECOVERY_USED: "mfa_recovery_used",
  RECOVERY_REGENERATED: "mfa_recovery_regenerated",
  STEP_UP_VERIFIED: "mfa_step_up_verified",
  SESSION_CREATED: "session_created",
  SESSION_REVOKED: "session_revoked",
  ALL_SESSIONS_REVOKED: "all_sessions_revoked",
});

const now = () => new Date();
const addSeconds = (date, seconds) => new Date(date.getTime() + seconds * 1000);
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);

export const hashOpaqueToken = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

export const normalizeRecoveryCode = (value) =>
  String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

function encryptionKey() {
  const configured = String(env.MFA_ENCRYPTION_KEY || "").trim();
  if (!configured) {
    throw new Error("MFA_ENCRYPTION_KEY is required for MFA operations");
  }

  if (/^[a-fA-F0-9]{64}$/.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters");
  }
  return decoded;
}

export function encryptMfaSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptMfaSecret(factor) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(factor.secret_iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(factor.secret_tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(factor.secret_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function createRecoveryCodes(count = env.MFA_RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}

export function challengeIsUsable(challenge, expectedPurpose, at = now()) {
  return Boolean(
    challenge &&
      !challenge.consumed_at &&
      challenge.expires_at > at &&
      challenge.attempts < challenge.max_attempts &&
      (!expectedPurpose || challenge.purpose === expectedPurpose),
  );
}

export async function verifyTotpCode(factor, token, { preventReplay = true } = {}) {
  return verify({
    secret: decryptMfaSecret(factor),
    token: String(token),
    epochTolerance: env.MFA_TOTP_TOLERANCE_SECONDS,
    ...(!preventReplay || factor.last_used_step == null
      ? {}
      : { afterTimeStep: Number(factor.last_used_step) }),
  });
}

function parseContext(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function requestSecurityMetadata(request, deviceLabel) {
  const forwarded = request.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || request.ip || "").split(",")[0].trim();
  return {
    ipAddress: ip || null,
    userAgent: String(request.headers["user-agent"] || "").slice(0, 512) || null,
    deviceLabel: deviceLabel ? String(deviceLabel).trim().slice(0, 150) : null,
  };
}

export default class MfaSecurityService {
  async _audit(eventType, { userId, sessionId, metadata, context } = {}, executor = authDb) {
    const safeMetadata = metadata
      ? {
          deviceLabel: metadata.deviceLabel || null,
          ...(context || {}),
        }
      : context || null;
    await executor.insert(authSecurityEvents).values({
      user_id: userId ?? null,
      session_id: sessionId ?? null,
      event_type: eventType,
      ip_address: metadata?.ipAddress ?? null,
      user_agent: metadata?.userAgent ?? null,
      metadata_json: safeMetadata ? JSON.stringify(safeMetadata) : null,
      date_created: now(),
    });
  }

  async _factorForUser(userId) {
    const [factor] = await authDb
      .select()
      .from(authMfaFactors)
      .where(eq(authMfaFactors.user_id, userId))
      .limit(1);
    return factor || null;
  }

  async _replacePendingFactor(userId) {
    const secret = generateSecret();
    const encrypted = encryptMfaSecret(secret);
    const timestamp = now();
    const existing = await this._factorForUser(userId);

    if (existing) {
      await authDb
        .update(authMfaFactors)
        .set({
          secret_ciphertext: encrypted.ciphertext,
          secret_iv: encrypted.iv,
          secret_tag: encrypted.tag,
          is_enabled: 0,
          last_used_step: null,
          enrolled_at: null,
          date_modified: timestamp,
        })
        .where(eq(authMfaFactors.user_id, userId));
    } else {
      await authDb.insert(authMfaFactors).values({
        user_id: userId,
        factor_type: "totp",
        secret_ciphertext: encrypted.ciphertext,
        secret_iv: encrypted.iv,
        secret_tag: encrypted.tag,
        is_enabled: 0,
        date_created: timestamp,
        date_modified: timestamp,
      });
    }

    return secret;
  }

  async _createChallenge(userId, purpose, context, metadata) {
    const timestamp = now();
    const challengeToken = crypto.randomBytes(32).toString("base64url");

    await authDb
      .update(authLoginChallenges)
      .set({ consumed_at: timestamp })
      .where(
        and(
          eq(authLoginChallenges.user_id, userId),
          isNull(authLoginChallenges.consumed_at),
        ),
      );

    await authDb.insert(authLoginChallenges).values({
      id: crypto.randomUUID(),
      user_id: userId,
      purpose,
      token_hash: hashOpaqueToken(challengeToken),
      attempts: 0,
      max_attempts: env.MFA_MAX_ATTEMPTS,
      expires_at: addSeconds(timestamp, env.MFA_CHALLENGE_TTL_SECONDS),
      context_json: JSON.stringify(context || {}),
      date_created: timestamp,
    });
    await this._audit(SECURITY_EVENT.CHALLENGE_CREATED, {
      userId,
      metadata,
      context: { purpose },
    });

    return challengeToken;
  }

  async beginAuthentication(user, { context = {}, metadata = {} } = {}) {
    const factor = await this._factorForUser(user.id);

    if (!factor?.is_enabled) {
      const secret = await this._replacePendingFactor(user.id);
      const challengeToken = await this._createChallenge(
        user.id,
        CHALLENGE_PURPOSE.ENROLL,
        context,
        metadata,
      );
      return {
        state: "mfa_enrollment_required",
        challenge_token: challengeToken,
        expires_in: env.MFA_CHALLENGE_TTL_SECONDS,
        factor: {
          type: "totp",
          issuer: env.MFA_ISSUER,
          account_name: user.email,
          secret,
          otpauth_uri: generateURI({
            issuer: env.MFA_ISSUER,
            label: user.email,
            secret,
          }),
        },
      };
    }

    const challengeToken = await this._createChallenge(
      user.id,
      CHALLENGE_PURPOSE.LOGIN,
      context,
      metadata,
    );
    return {
      state: "mfa_required",
      challenge_token: challengeToken,
      expires_in: env.MFA_CHALLENGE_TTL_SECONDS,
      methods: ["totp", "recovery_code"],
    };
  }

  async _activeChallenge(challengeToken, expectedPurpose) {
    const tokenHash = hashOpaqueToken(challengeToken);
    const [challenge] = await authDb
      .select()
      .from(authLoginChallenges)
      .where(eq(authLoginChallenges.token_hash, tokenHash))
      .limit(1);

    if (!challengeIsUsable(challenge, expectedPurpose)) {
      throw new ErrorClass("MFA challenge is invalid or expired", 401);
    }
    return challenge;
  }

  async _recordFailedAttempt(challenge, metadata) {
    const attempts = challenge.attempts + 1;
    await authDb
      .update(authLoginChallenges)
      .set({
        attempts,
        consumed_at: attempts >= challenge.max_attempts ? now() : null,
      })
      .where(
        and(
          eq(authLoginChallenges.id, challenge.id),
          isNull(authLoginChallenges.consumed_at),
        ),
      );
    await this._audit(SECURITY_EVENT.CHALLENGE_FAILED, {
      userId: challenge.user_id,
      metadata,
      context: { purpose: challenge.purpose, attempts },
    });
  }

  async _consumeChallenge(challenge, executor = authDb) {
    const result = await executor
      .update(authLoginChallenges)
      .set({ consumed_at: now() })
      .where(
        and(
          eq(authLoginChallenges.id, challenge.id),
          isNull(authLoginChallenges.consumed_at),
        ),
      );
    if (Number(result[0]?.affectedRows || 0) !== 1) {
      throw new ErrorClass("MFA challenge has already been used", 401);
    }
  }

  async _replaceRecoveryCodes(userId, executor = authDb) {
    const codes = createRecoveryCodes();
    await executor
      .delete(authMfaRecoveryCodes)
      .where(eq(authMfaRecoveryCodes.user_id, userId));
    await executor.insert(authMfaRecoveryCodes).values(
      codes.map((code) => ({
        user_id: userId,
        code_hash: hashOpaqueToken(normalizeRecoveryCode(code)),
        date_created: now(),
      })),
    );
    return codes;
  }

  async confirmEnrollment({ challengeToken, code, metadata = {} }) {
    const challenge = await this._activeChallenge(
      challengeToken,
      CHALLENGE_PURPOSE.ENROLL,
    );
    const factor = await this._factorForUser(challenge.user_id);
    if (!factor || factor.is_enabled) {
      throw new ErrorClass("MFA enrollment is no longer pending", 409);
    }

    const result = await verifyTotpCode(factor, code, { preventReplay: false });
    if (!result.valid) {
      await this._recordFailedAttempt(challenge, metadata);
      throw new ErrorClass("Invalid authentication code", 401);
    }

    const recoveryCodes = await authDb.transaction(async (tx) => {
      const timestamp = now();
      await this._consumeChallenge(challenge, tx);
      await tx
        .update(authMfaFactors)
        .set({
          is_enabled: 1,
          last_used_step: result.timeStep,
          enrolled_at: timestamp,
          date_modified: timestamp,
        })
        .where(eq(authMfaFactors.user_id, challenge.user_id));
      const generated = await this._replaceRecoveryCodes(challenge.user_id, tx);
      await this._audit(
        SECURITY_EVENT.ENROLLED,
        { userId: challenge.user_id, metadata },
        tx,
      );
      return generated;
    });

    return {
      userId: challenge.user_id,
      context: parseContext(challenge.context_json),
      recoveryCodes,
      authMethod: "totp",
    };
  }

  async _verifyRecoveryCode(userId, recoveryCode) {
    const codeHash = hashOpaqueToken(normalizeRecoveryCode(recoveryCode));
    const result = await authDb
      .update(authMfaRecoveryCodes)
      .set({ used_at: now() })
      .where(
        and(
          eq(authMfaRecoveryCodes.user_id, userId),
          eq(authMfaRecoveryCodes.code_hash, codeHash),
          isNull(authMfaRecoveryCodes.used_at),
        ),
      );
    return Number(result[0]?.affectedRows || 0) === 1;
  }

  async completeLoginChallenge({
    challengeToken,
    code,
    recoveryCode,
    metadata = {},
  }) {
    const challenge = await this._activeChallenge(
      challengeToken,
      CHALLENGE_PURPOSE.LOGIN,
    );
    const factor = await this._factorForUser(challenge.user_id);
    if (!factor?.is_enabled) {
      throw new ErrorClass("MFA enrollment is required", 409);
    }

    let authMethod;
    let verifiedTimeStep;
    if (recoveryCode) {
      const validRecovery = await this._verifyRecoveryCode(
        challenge.user_id,
        recoveryCode,
      );
      if (!validRecovery) {
        await this._recordFailedAttempt(challenge, metadata);
        throw new ErrorClass("Invalid recovery code", 401);
      }
      authMethod = "recovery_code";
    } else {
      const result = await verifyTotpCode(factor, code);
      if (!result.valid) {
        await this._recordFailedAttempt(challenge, metadata);
        throw new ErrorClass("Invalid authentication code", 401);
      }
      verifiedTimeStep = result.timeStep;
      authMethod = "totp";
    }

    await this._consumeChallenge(challenge);
    if (verifiedTimeStep !== undefined) {
      await authDb
        .update(authMfaFactors)
        .set({ last_used_step: verifiedTimeStep, date_modified: now() })
        .where(eq(authMfaFactors.user_id, challenge.user_id));
    }
    await this._audit(
      authMethod === "recovery_code"
        ? SECURITY_EVENT.RECOVERY_USED
        : SECURITY_EVENT.LOGIN_VERIFIED,
      { userId: challenge.user_id, metadata },
    );

    return {
      userId: challenge.user_id,
      context: parseContext(challenge.context_json),
      authMethod,
    };
  }

  async createSingleDeviceSession(userId, authMethod, metadata = {}) {
    const timestamp = now();
    const sessionId = crypto.randomUUID();
    const expiresAt = addHours(timestamp, env.AUTH_SESSION_TTL_HOURS);

    await authDb.transaction(async (tx) => {
      await tx
        .update(authSessions)
        .set({
          is_active: null,
          revoked_at: timestamp,
          revoke_reason: "replaced_by_new_device",
        })
        .where(
          and(
            eq(authSessions.user_id, userId),
            eq(authSessions.is_active, 1),
            isNull(authSessions.revoked_at),
          ),
        );
      await tx.insert(authSessions).values({
        id: sessionId,
        user_id: userId,
        auth_method: authMethod,
        mfa_verified_at: timestamp,
        ip_address: metadata.ipAddress || null,
        user_agent: metadata.userAgent || null,
        device_label: metadata.deviceLabel || null,
        last_seen_at: timestamp,
        expires_at: expiresAt,
        is_active: 1,
        date_created: timestamp,
      });
      await this._audit(
        SECURITY_EVENT.SESSION_CREATED,
        { userId, sessionId, metadata, context: { authMethod } },
        tx,
      );
    });

    return { id: sessionId, expiresAt, mfaVerifiedAt: timestamp };
  }

  async getActiveSession(sessionId, userId) {
    const [session] = await authDb
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.user_id, userId),
          eq(authSessions.is_active, 1),
          isNull(authSessions.revoked_at),
          gt(authSessions.expires_at, now()),
        ),
      )
      .limit(1);
    return session || null;
  }

  async touchSession(sessionId) {
    await authDb
      .update(authSessions)
      .set({ last_seen_at: now() })
      .where(eq(authSessions.id, sessionId));
  }

  async listSessions(userId) {
    return authDb
      .select({
        id: authSessions.id,
        auth_method: authSessions.auth_method,
        mfa_verified_at: authSessions.mfa_verified_at,
        ip_address: authSessions.ip_address,
        user_agent: authSessions.user_agent,
        device_label: authSessions.device_label,
        last_seen_at: authSessions.last_seen_at,
        expires_at: authSessions.expires_at,
        is_active: authSessions.is_active,
        revoked_at: authSessions.revoked_at,
        revoke_reason: authSessions.revoke_reason,
        date_created: authSessions.date_created,
      })
      .from(authSessions)
      .where(eq(authSessions.user_id, userId))
      .orderBy(desc(authSessions.date_created))
      .limit(20);
  }

  async revokeSession(sessionId, userId, metadata = {}, reason = "logout") {
    await authDb
      .update(authSessions)
      .set({ is_active: null, revoked_at: now(), revoke_reason: reason })
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.user_id, userId),
          eq(authSessions.is_active, 1),
        ),
      );
    await this._audit(SECURITY_EVENT.SESSION_REVOKED, {
      userId,
      sessionId,
      metadata,
      context: { reason },
    });
  }

  async revokeAllSessions(userId, metadata = {}, reason = "logout_all") {
    await authDb
      .update(authSessions)
      .set({ is_active: null, revoked_at: now(), revoke_reason: reason })
      .where(
        and(
          eq(authSessions.user_id, userId),
          eq(authSessions.is_active, 1),
          isNull(authSessions.revoked_at),
        ),
      );
    await this._audit(SECURITY_EVENT.ALL_SESSIONS_REVOKED, {
      userId,
      metadata,
      context: { reason },
    });
  }

  async regenerateRecoveryCodes(userId, code, metadata = {}) {
    const factor = await this._factorForUser(userId);
    if (!factor?.is_enabled) {
      throw new ErrorClass("MFA is not enrolled", 409);
    }
    const result = await verifyTotpCode(factor, code);
    if (!result.valid) {
      throw new ErrorClass("Invalid authentication code", 401);
    }

    const codes = await authDb.transaction(async (tx) => {
      await tx
        .update(authMfaFactors)
        .set({ last_used_step: result.timeStep, date_modified: now() })
        .where(eq(authMfaFactors.user_id, userId));
      const generated = await this._replaceRecoveryCodes(userId, tx);
      await this._audit(
        SECURITY_EVENT.RECOVERY_REGENERATED,
        { userId, metadata },
        tx,
      );
      return generated;
    });
    return codes;
  }

  async verifyStepUp(userId, sessionId, code, metadata = {}) {
    const factor = await this._factorForUser(userId);
    if (!factor?.is_enabled) {
      throw new ErrorClass("MFA is not enrolled", 409);
    }
    const result = await verifyTotpCode(factor, code);
    if (!result.valid) {
      throw new ErrorClass("Invalid authentication code", 401);
    }

    const timestamp = now();
    await authDb.transaction(async (tx) => {
      await tx
        .update(authMfaFactors)
        .set({ last_used_step: result.timeStep, date_modified: timestamp })
        .where(eq(authMfaFactors.user_id, userId));
      await tx
        .update(authSessions)
        .set({ mfa_verified_at: timestamp, last_seen_at: timestamp })
        .where(
          and(
            eq(authSessions.id, sessionId),
            eq(authSessions.user_id, userId),
            eq(authSessions.is_active, 1),
            isNull(authSessions.revoked_at),
          ),
        );
      await this._audit(
        SECURITY_EVENT.STEP_UP_VERIFIED,
        { userId, sessionId, metadata },
        tx,
      );
    });
    return { mfa_verified_at: timestamp };
  }
}

export { CHALLENGE_PURPOSE, SECURITY_EVENT };
