import CryptoJS from "crypto-js";
import { ErrorClass } from "./errorClass/index.js";

/**
 * Port of colleague EncryptionDecryption (CryptoJS AES-256-CBC, PKCS7).
 */
export class EncryptionDecryption {
  constructor(getKeyAndIV = defaultGetKeyAndIV) {
    this.getKeyAndIV = getKeyAndIV;
  }

  encrypt(data, key, iv) {
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
      throw new ErrorClass(`Failed to encrypt data: ${error.message}`, 500);
    }
  }

  decrypt(cipherText, key, iv) {
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
      throw new ErrorClass(`Failed to decrypt data: ${error.message}`, 500);
    }
  }

  getKey_IV(secret) {
    return this.getKeyAndIV(secret);
  }
}

function defaultGetKeyAndIV(secret) {
  const envSecret = secret;
  if (!envSecret || envSecret.length < 48) {
    throw new ErrorClass("KEYCHAIN must be at least 48 characters long", 500);
  }
  return {
    key: envSecret.slice(0, 32),
    iv: envSecret.slice(-16),
  };
}

export const encryptionDecryption = new EncryptionDecryption();
