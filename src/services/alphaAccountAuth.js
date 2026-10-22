import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { stripWrappingQuotes } from "../utils/decryptProdSecret.js";
import {
  decryptIsvsProductKeyFromEnv,
  resolveIsvsEncryptionKey,
  generateIsvsIv,
  encryptIsvsJson,
  buildIsvsCredentialsHeader,
  decryptIsvsApiResponse,
} from "../utils/isvsCryptoJs.js";

const LOGIN_BASIC_PATH = "/2.202504.0/Account/Auth/Login/Client/Basic";
const DEFAULT_MFA_VERIFY_PATH = "/2.202504.0/Account/Auth/Login/Client/Mfa/Verify";
const DEFAULT_MFA_ENROLL_PATH = "/2.202504.0/Account/Auth/Login/Client/Mfa/Enroll/Confirm";

const DEFAULT_MAILER = Object.freeze({
  client: {
    name: "Redbiller",
    email_address: "support@redbiller.com",
  },
  template: {
    key: "account-redbiller-com/account/login/client/basic/notify.html",
  },
});

function requireEnv(name, value) {
  const v = stripWrappingQuotes(String(value || "").trim());
  if (!v) {
    throw new ErrorClass(`${name} is not configured`, 500);
  }
  return v;
}

function resolveAccountAuthSecrets() {
  const productKeyEnc = requireEnv("ACCOUNT_AUTH_PRODUCT_KEY", env.ACCOUNT_AUTH_PRODUCT_KEY);
  const productKeychain = requireEnv(
    "ACCOUNT_AUTH_PRODUCT_KEYCHAIN",
    env.ACCOUNT_AUTH_PRODUCT_KEYCHAIN,
  );
  const baseEnc = requireEnv("ACCOUNT_AUTH_API_BASE_URL", env.ACCOUNT_AUTH_API_BASE_URL);
  const baseKeychain = requireEnv(
    "ACCOUNT_AUTH_API_BASE_URL_KEYCHAIN",
    env.ACCOUNT_AUTH_API_BASE_URL_KEYCHAIN,
  );

  const productKey = stripWrappingQuotes(
    decryptIsvsProductKeyFromEnv(productKeyEnc, productKeychain, {
      valueName: "ACCOUNT_AUTH_PRODUCT_KEY",
    }),
  );
  const baseUrl = stripWrappingQuotes(
    decryptIsvsProductKeyFromEnv(baseEnc, baseKeychain, {
      valueName: "ACCOUNT_AUTH_API_BASE_URL",
    }),
  ).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new ErrorClass("ACCOUNT_AUTH_API_BASE_URL did not decrypt to a valid URL", 500);
  }

  return { productKey, baseUrl };
}

function unwrapAlpha(decrypted) {
  if (!decrypted || typeof decrypted !== "object") return {};
  if (decrypted.data && typeof decrypted.data === "object") {
    const inner = decrypted.data;
    if (inner.data && typeof inner.data === "object") return inner.data;
    return inner;
  }
  return decrypted;
}

function isAlphaSuccess(body) {
  if (!body || typeof body !== "object") return false;
  if (body.success === true || body.state === true) return true;
  const code = body.code ?? body.data?.code;
  if (code === 200 || code === 2000 || code === "200" || code === "2000") return true;
  return false;
}

function alphaErrorMessage(body, fallback) {
  return (
    body?.message ||
    body?.data?.message ||
    body?.error ||
    body?.data?.error ||
    fallback
  );
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

function normalizeMfaFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["y", "yes", "true", "1", "enabled", "on"].includes(normalized)) return true;
  if (["n", "no", "false", "0", "disabled", "off"].includes(normalized)) return false;
  return null;
}

/** True only when Alpha payload explicitly marks MFA enabled on the account. */
export function alphaAccountMfaEnabled(decrypted) {
  const root = unwrapAlpha(decrypted);
  const account = root.account || root.user || {};
  const candidates = [
    account.mfa,
    account.mfa_enabled,
    account.is_mfa_enabled,
    account.has_mfa,
    root.mfa,
    root.mfa_enabled,
  ];
  for (const candidate of candidates) {
    const parsed = normalizeMfaFlag(candidate);
    if (parsed !== null) return parsed;
  }
  return false;
}

export function assertAlphaAccountMfaEnabled(decrypted) {
  if (alphaAccountMfaEnabled(decrypted)) return;
  throw new ErrorClass(
    "Multi-factor authentication must be enabled on your Redbiller account before using Console. Set up MFA in Alpha account settings, then sign in again.",
    403,
  );
}

function extractAlphaContext(decrypted) {
  const root = unwrapAlpha(decrypted);
  const account = root.account || root.user || {};
  const session = root.session || account.session || {};
  return {
    mfaEnabled: alphaAccountMfaEnabled(decrypted),
    sessionID: pickFirst(
      root.sessionID,
      root.session_id,
      session.id,
      session.session_id,
      session.sessionID,
    ),
    userKey: pickFirst(
      root.userKey,
      root.user_key,
      account.user_key,
      account.userKey,
      account.key,
    ),
    challengeToken: pickFirst(
      root.challenge_token,
      root.challengeToken,
      root.mfa_token,
      root.mfaToken,
      root.token,
      root.otp_token,
      session.challenge_token,
    ),
    otpauthUri: pickFirst(
      root.otpauth_uri,
      root.otpauthUri,
      root.factor?.otpauth_uri,
      account.otpauth_uri,
    ),
    email: pickFirst(root.email, account.email, account.email_address),
    raw: root,
  };
}

/**
 * @returns {'authenticated'|'mfa_verify'|'mfa_enroll'|'failed'}
 */
export function parseAlphaAuthPhase(decrypted) {
  if (isAlphaSuccess(decrypted)) {
    return { phase: "authenticated", context: extractAlphaContext(decrypted) };
  }

  const root = unwrapAlpha(decrypted);
  const state = String(root?.state ?? root?.status ?? "").toLowerCase();
  const code = decrypted?.code ?? root?.code;

  const looksLikeMfa =
    /mfa|2fa|otp|verify|challenge|authenticator/.test(state) ||
    root?.mfa_required === true ||
    root?.requires_mfa === true ||
    root?.requiresMfa === true ||
    Boolean(extractAlphaContext(decrypted).challengeToken) ||
    Boolean(extractAlphaContext(decrypted).otpauthUri);

  if (looksLikeMfa) {
    const enroll = /enroll|setup|register|configure|bind/.test(state);
    return {
      phase: enroll ? "mfa_enroll" : "mfa_verify",
      context: extractAlphaContext(decrypted),
    };
  }

  // Some Alpha builds use non-200 codes while still returning MFA hints in payload.
  if (code === 4010 || code === 401 || code === "4010" || code === "401") {
    const ctx = extractAlphaContext(decrypted);
    if (ctx.challengeToken || ctx.otpauthUri) {
      return { phase: "mfa_verify", context: ctx };
    }
  }

  return {
    phase: "failed",
    message: alphaErrorMessage(decrypted, "Request denied."),
    context: extractAlphaContext(decrypted),
  };
}

async function alphaEncryptedPost(path, payload, { extraCredentials = {} } = {}) {
  const { productKey, baseUrl } = resolveAccountAuthSecrets();
  const encryptionKey = resolveIsvsEncryptionKey(productKey, {
    secretName: "ACCOUNT_AUTH_PRODUCT_KEY",
  });
  const iv = generateIsvsIv();
  const requestId = crypto.randomUUID();

  const credentialsObject = {
    "Source-Product-Key": productKey,
    "Target-Product-Key": productKey,
    "Request-Id": requestId,
    ...extraCredentials,
  };

  const endpoint = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Credentials: buildIsvsCredentialsHeader(credentialsObject, encryptionKey, iv),
  };
  const body = { payload: encryptIsvsJson(payload, encryptionKey, iv) };

  let response;
  try {
    response = await axios.post(endpoint, body, {
      headers,
      timeout: Number(env.ACCOUNT_AUTH_TIMEOUT_MS || 20000),
      validateStatus: () => true,
    });
  } catch (error) {
    throw new ErrorClass(
      error.code === "ENOTFOUND"
        ? `Alpha host unreachable (${error.message})`
        : error.message || "Alpha request failed",
      502,
    );
  }

  const raw = response.data;
  let decrypted = raw;
  try {
    if (raw && typeof raw === "object" && raw.response) {
      decrypted = decryptIsvsApiResponse(raw, encryptionKey, iv);
    }
  } catch {
    decrypted = raw;
  }

  const phaseResult = parseAlphaAuthPhase(decrypted);
  if (phaseResult.phase === "failed" && response.status >= 400) {
    throw new ErrorClass(phaseResult.message || "Alpha request failed", response.status);
  }
  if (phaseResult.phase === "failed") {
    throw new ErrorClass(phaseResult.message || "Alpha request failed", 401);
  }

  return {
    httpStatus: response.status,
    raw,
    decrypted,
    encryptionKey,
    iv,
    ...phaseResult,
  };
}

function buildMfaPayload(email, code, alphaContext = {}) {
  const ctx = alphaContext?.raw ? { ...alphaContext, ...alphaContext.raw } : alphaContext;
  const challenge = pickFirst(
    alphaContext.challengeToken,
    ctx?.challenge_token,
    ctx?.mfa_token,
    ctx?.token,
  );
  const sessionID = pickFirst(alphaContext.sessionID, ctx?.sessionID, ctx?.session_id);

  const payload = {
    email: String(email || "").trim().toLowerCase(),
    code: String(code || ""),
    otp: String(code || ""),
    token: challenge,
    challenge_token: challenge,
    mfa_token: challenge,
    sessionID,
    session_id: sessionID,
    mailer: DEFAULT_MAILER,
  };

  if (alphaContext.userKey) {
    payload.user_key = alphaContext.userKey;
    payload.userKey = alphaContext.userKey;
  }

  return payload;
}

/**
 * Alpha Account Auth — Login/Client/Basic
 */
export async function alphaClientBasicLogin({ email, password }) {
  const payload = {
    email: String(email || "").trim().toLowerCase(),
    password: String(password || ""),
    mailer: DEFAULT_MAILER,
  };
  return alphaEncryptedPost(LOGIN_BASIC_PATH, payload);
}

export async function alphaClientMfaVerify({ email, code, alphaContext }) {
  const path =
    stripWrappingQuotes(env.ACCOUNT_AUTH_MFA_VERIFY_PATH || "") || DEFAULT_MFA_VERIFY_PATH;
  const payload = buildMfaPayload(email, code, alphaContext);
  const extra = {};
  if (alphaContext?.userKey) extra["User-Key"] = alphaContext.userKey;
  return alphaEncryptedPost(path, payload, { extraCredentials: extra });
}

export async function alphaClientMfaEnrollConfirm({ email, code, alphaContext }) {
  const path =
    stripWrappingQuotes(env.ACCOUNT_AUTH_MFA_ENROLL_PATH || "") || DEFAULT_MFA_ENROLL_PATH;
  const payload = buildMfaPayload(email, code, alphaContext);
  const extra = {};
  if (alphaContext?.userKey) extra["User-Key"] = alphaContext.userKey;
  return alphaEncryptedPost(path, payload, { extraCredentials: extra });
}

/** @deprecated use extractAlphaContext via parseAlphaAuthPhase */
export function extractAlphaLoginContext(decrypted) {
  const ctx = extractAlphaContext(decrypted);
  return { sessionID: ctx.sessionID, userKey: ctx.userKey };
}
