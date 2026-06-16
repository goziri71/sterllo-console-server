import CryptoJS from "crypto-js";
import crypto from "node:crypto";
import { ErrorClass } from "./errorClass/index.js";
import { stripWrappingQuotes } from "./decryptProdSecret.js";

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
  try {
    const secretKey = CryptoJS.enc.Utf8.parse(key);
    const ivParams = CryptoJS.enc.Utf8.parse(iv);
    const cipherText = CryptoJS.enc.Utf8.parse(JSON.stringify(data));
    const encrypted = CryptoJS.AES.encrypt(cipherText, secretKey, {
      iv: ivParams,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  } catch (error) {
    throw new ErrorClass(`Failed to encrypt ISVS data: ${error.message}`, 500);
  }
}

/** Inverse of encryptIsvsJson (colleague decrypt). */
export function decryptIsvsJson(cipherText, key, iv) {
  try {
    const normalizedKey = String(key).length > 32 ? String(key).slice(0, 32) : String(key);
    let cleanedCipherText = cipherText;

    if (typeof cipherText === "string") {
      cleanedCipherText = cipherText.replace(/\\\//g, "/");
    }

    const secretKey = CryptoJS.enc.Utf8.parse(normalizedKey);
    const ivParams = CryptoJS.enc.Utf8.parse(iv);

    const parsedCipherText = CryptoJS.enc.Base64.parse(cleanedCipherText);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: parsedCipherText,
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, secretKey, {
      iv: ivParams,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const utf8Text = decrypted.toString(CryptoJS.enc.Utf8);
    if (!utf8Text) {
      throw new Error("Empty decrypt result");
    }

    try {
      return JSON.parse(utf8Text);
    } catch {
      return utf8Text;
    }
  } catch (error) {
    throw new ErrorClass(`Failed to decrypt ISVS data: ${error.message}`, 500);
  }
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
  return decryptIsvsJson(ciphertext, encryptionKey, iv);
}
