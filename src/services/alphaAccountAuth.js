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

const LOGIN_PATH = "/2.202504.0/Account/Auth/Login/Client/Basic";

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
  const productKeyEnc = requireEnv(
    "ACCOUNT_AUTH_PRODUCT_KEY",
    process.env.ACCOUNT_AUTH_PRODUCT_KEY,
  );
  const productKeychain = requireEnv(
    "ACCOUNT_AUTH_PRODUCT_KEYCHAIN",
    process.env.ACCOUNT_AUTH_PRODUCT_KEYCHAIN || process.env.ACCOUNT_AUTH_PRODUCT_KEY_KEYCHAIN,
  );
  const baseEnc = requireEnv(
    "ACCOUNT_AUTH_API_BASE_URL",
    process.env.ACCOUNT_AUTH_API_BASE_URL,
  );
  const baseKeychain = requireEnv(
    "ACCOUNT_AUTH_API_BASE_URL_KEYCHAIN",
    process.env.ACCOUNT_AUTH_API_BASE_URL_KEYCHAIN,
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

/**
 * Alpha Account Auth — Login/Client/Basic (makeEncryptedApiCall / productId style).
 * @returns {{ httpStatus, raw, decrypted, encryptionKey, iv }}
 */
export async function alphaClientBasicLogin({ email, password }) {
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
  };

  const payload = {
    email: String(email || "").trim().toLowerCase(),
    password: String(password || ""),
    mailer: DEFAULT_MAILER,
  };

  const endpoint = `${baseUrl}${LOGIN_PATH}`;
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
        : error.message || "Alpha login request failed",
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

  if (!isAlphaSuccess(decrypted) && response.status >= 400) {
    throw new ErrorClass(
      alphaErrorMessage(decrypted, "Login failed"),
      response.status >= 400 && response.status < 600 ? response.status : 401,
    );
  }

  if (!isAlphaSuccess(decrypted)) {
    // Some Alpha errors still return HTTP 200 with encrypted business failure.
    throw new ErrorClass(alphaErrorMessage(decrypted, "Invalid email or password"), 401);
  }

  return {
    httpStatus: response.status,
    raw,
    decrypted,
    encryptionKey,
    iv,
  };
}

/** Pull session / identity hints from Alpha success payload when present. */
export function extractAlphaLoginContext(decrypted) {
  const root = decrypted?.data && typeof decrypted.data === "object" ? decrypted.data : decrypted || {};
  const account = root.account || root.user || {};
  const session = root.session || account.session || {};
  return {
    sessionID:
      root.sessionID ??
      root.session_id ??
      session.id ??
      session.session_id ??
      null,
    userKey:
      root.userKey ??
      root.user_key ??
      account.user_key ??
      account.key ??
      null,
  };
}
