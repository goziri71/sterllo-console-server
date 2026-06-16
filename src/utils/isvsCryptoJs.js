import CryptoJS from "crypto-js";
import crypto from "node:crypto";
import { ErrorClass } from "./errorClass/index.js";
import { stripWrappingQuotes } from "./decryptProdSecret.js";
import { encryptionDecryption } from "./encryptionDecryption.js";

/** Random 16-char IV (UTF-8), appended to ISVS `Credentials` header. */
export function generateIsvsIv() {
  return crypto.randomBytes(8).toString("hex");
}

/** Colleague: `encryptionIsvsKey = decryptedIsvsProductKey.substring(0, 32)`. */
export function resolveIsvsEncryptionKey(decryptedProductKey, { secretName = "product key" } = {}) {
  const plain = stripWrappingQuotes(String(decryptedProductKey ?? ""));
  if (plain.length < 32) {
    throw new ErrorClass(`${secretName} must be at least 32 characters after decrypt`, 500);
  }
  return plain.slice(0, 32);
}

/** Split `Credentials` header into ciphertext + trailing 16-char IV. */
export function splitIsvsCredentialsHeader(credentialsHeader) {
  const raw = stripWrappingQuotes(String(credentialsHeader ?? ""));
  if (raw.length <= 16) {
    throw new ErrorClass("Credentials header too short to contain IV suffix", 500);
  }
  return {
    ciphertext: raw.slice(0, -16),
    iv: raw.slice(-16),
  };
}

/** Build ISVS `Credentials` header: base64 ciphertext + 16-char IV suffix. */
export function buildIsvsCredentialsHeader(credentialsObject, encryptionKey, iv) {
  const encrypted = encryptIsvsJson(credentialsObject, encryptionKey, iv);
  return `${encrypted}${iv}`;
}

/**
 * ISVS / Sterllo CryptoJS AES-256-CBC (matches colleague EncryptionDecryption).
 * secret = 48+ char keychain → key = first 32 chars, iv = last 16 chars (UTF-8).
 */
export function getIsvsKeyAndIv(secret, { secretName = "KEYCHAIN" } = {}) {
  const envSecret = stripWrappingQuotes(String(secret ?? ""));

  if (!envSecret || envSecret.length < 48) {
    throw new ErrorClass(`${secretName} must be at least 48 characters long`, 500);
  }

  return {
    key: envSecret.slice(0, 32),
    iv: envSecret.slice(-16),
  };
}

/** AES-256-CBC encrypt; `data` is JSON.stringify'd before encrypt (same as colleague). */
export function encryptIsvsJson(data, key, iv) {
  return encryptionDecryption.encrypt(data, key, iv);
}

/** Inverse of encryptIsvsJson (colleague decrypt). */
export function decryptIsvsJson(cipherText, key, iv) {
  return encryptionDecryption.decrypt(cipherText, key, iv);
}

/** Non-throwing decrypt for response probing. */
export function tryDecryptIsvsJson(cipherText, key, iv) {
  try {
    return decryptIsvsJson(cipherText, key, iv);
  } catch {
    return null;
  }
}

/** Colleague initializeProductKeys: CryptoJS decrypt env ciphertext, then Base64 unwrap. */
export function decryptIsvsProductKeyFromEnv(encryptedValue, keychainValue, { valueName = "product key" } = {}) {
  const enc = stripWrappingQuotes(String(encryptedValue ?? "").trim());
  const kc = stripWrappingQuotes(String(keychainValue ?? "").trim());
  if (!enc) return "";
  if (!kc) return enc;

  const { key, iv } = getIsvsKeyAndIv(kc, { secretName: valueName });
  const step1 = decryptIsvsJson(enc, key, iv);
  if (typeof step1 !== "string") {
    return stripWrappingQuotes(String(step1));
  }
  try {
    return stripWrappingQuotes(CryptoJS.enc.Base64.parse(step1).toString(CryptoJS.enc.Utf8));
  } catch {
    return stripWrappingQuotes(step1);
  }
}

/** Colleague makeEncryptedApiCall response decrypt: `data.response` with request key + IV. */
export function decryptIsvsApiResponse(rawBody, encryptionKey, iv) {
  const payload = rawBody && typeof rawBody === "object" ? rawBody : null;
  if (!payload) return rawBody;

  const ciphertext =
    typeof payload.response === "string" && payload.response.trim()
      ? payload.response.trim()
      : typeof payload.data?.response === "string" && payload.data.response.trim()
        ? payload.data.response.trim()
        : null;

  if (!ciphertext || !encryptionKey || !iv || String(iv).length !== 16) {
    return rawBody;
  }

  const key = String(encryptionKey).length > 32 ? String(encryptionKey).slice(0, 32) : String(encryptionKey);
  const decrypted = tryDecryptIsvsJson(ciphertext, key, iv);
  if (decrypted == null) return rawBody;
  if (decrypted && typeof decrypted === "object" && !Array.isArray(decrypted)) {
    return decrypted;
  }
  return rawBody;
}

export function encryptIsvsWithKeychain(data, keychainSecret, options = {}) {
  const { key, iv } = getIsvsKeyAndIv(keychainSecret, options);
  return encryptIsvsJson(data, key, iv);
}

export function decryptIsvsWithKeychain(cipherText, keychainSecret, options = {}) {
  const { key, iv } = getIsvsKeyAndIv(keychainSecret, options);
  return decryptIsvsJson(cipherText, key, iv);
}

/** Decrypt ISVS `Credentials` header (ciphertext + trailing IV). */
export function decryptIsvsCredentialsHeader(credentialsHeader, encryptionKey) {
  const { ciphertext, iv } = splitIsvsCredentialsHeader(credentialsHeader);
  return encryptionDecryption.decrypt(ciphertext, encryptionKey, iv);
}
