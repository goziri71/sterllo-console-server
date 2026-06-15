import crypto from "node:crypto";

export const stripWrappingQuotes = (value = "") => {
  const trimmed = String(value).trim();
  const normalized = trimmed.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return normalized.replace(/^["'](.*)["']$/, "$1");
};

const required = (value, name) => {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
};

export const looksLikeBase64 = (value = "") => {
  const normalized = stripWrappingQuotes(String(value).trim());
  if (!normalized || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(normalized);
};

export const decodeBase64IfEncoded = (value = "") => {
  const normalized = String(value).trim();
  if (!looksLikeBase64(normalized)) return normalized;

  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf8").trim();
    if (!decoded) return normalized;

    const reEncoded = Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "");
    const original = normalized.replace(/=+$/, "");
    return reEncoded === original ? decoded : normalized;
  } catch {
    return normalized;
  }
};

export const getKeyIvFromKeychain = (keychain, keychainName) => {
  const normalizedKeychain = stripWrappingQuotes(required(keychain, keychainName));

  if (normalizedKeychain.length < 32) {
    throw new Error(`${keychainName} must be at least 32 characters long`);
  }

  const key = normalizedKeychain.slice(0, 32);
  const iv = normalizedKeychain.slice(-16);
  return { key, iv };
};

export const decryptAesBase64 = ({ encryptedValue, key, iv, valueName }) => {
  const normalizedEncrypted = stripWrappingQuotes(required(encryptedValue, valueName));

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "utf8"),
      Buffer.from(iv, "utf8"),
    );

    const decrypted = decipher.update(normalizedEncrypted, "base64", "utf8") + decipher.final("utf8");
    return decodeBase64IfEncoded(decrypted);
  } catch {
    throw new Error(`Unable to decrypt ${valueName}. Check encrypted value/keychain format.`);
  }
};

/**
 * Decrypt production DB-style secrets: AES-256-CBC, base64 ciphertext,
 * key = first 32 UTF-8 chars of keychain, IV = last 16 UTF-8 chars of keychain.
 * If ciphertext and keychain were swapped in storage, infers from base64 shape (same as env.js).
 */
export function decryptFromPlainPair(encryptedValue, keychainValue, { valueName = "secret" } = {}) {
  let enc = encryptedValue;
  let keyc = keychainValue;

  if (!looksLikeBase64(enc) && looksLikeBase64(keyc)) {
    enc = keychainValue;
    keyc = encryptedValue;
  }

  const { key, iv } = getKeyIvFromKeychain(keyc, "keychain");
  return decryptAesBase64({ encryptedValue: enc, key, iv, valueName });
}

export const encryptAesBase64 = ({ plainValue, key, iv, valueName = "value" }) => {
  const plain = stripWrappingQuotes(required(plainValue, valueName));

  try {
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "utf8"),
      Buffer.from(iv, "utf8"),
    );
    return cipher.update(plain, "utf8", "base64") + cipher.final("base64");
  } catch {
    throw new Error(`Unable to encrypt ${valueName}. Check keychain format.`);
  }
};

/**
 * Encrypt with AES-256-CBC (inverse of decryptFromPlainPair).
 * key = first 32 UTF-8 chars of keychain, IV = last 16 UTF-8 chars of keychain.
 */
export function encryptFromPlainPair(plainValue, keychainValue, { valueName = "secret" } = {}) {
  const { key, iv } = getKeyIvFromKeychain(keychainValue, "keychain");
  return encryptAesBase64({ plainValue: plainValue, key, iv, valueName });
}
