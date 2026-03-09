import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config();

const stripWrappingQuotes = (value = "") => {
  const trimmed = String(value).trim();
  const normalized = trimmed.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return normalized.replace(/^["'](.*)["']$/, "$1");
};

const required = (value, name) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const firstDefinedEnv = (...names) => {
  for (const name of names) {
    if (process.env[name] !== undefined && process.env[name] !== "") {
      return { value: process.env[name], name };
    }
  }
  return { value: undefined, name: names[0] };
};

const looksLikeBase64 = (value = "") => {
  const normalized = stripWrappingQuotes(String(value).trim());
  if (!normalized || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(normalized);
};

const decodeBase64IfEncoded = (value = "") => {
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

const getKeyIvFromKeychain = (keychain, keychainName) => {
  const normalizedKeychain = stripWrappingQuotes(required(keychain, keychainName));

  if (normalizedKeychain.length < 32) {
    throw new Error(`${keychainName} must be at least 32 characters long`);
  }

  const key = normalizedKeychain.slice(0, 32);
  const iv = normalizedKeychain.slice(-16);
  return { key, iv };
};

const decryptAesBase64 = ({ encryptedValue, key, iv, valueName }) => {
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

const decryptFromEnv = ({ encryptedVarNames, keychainVarNames, valueName }) => {
  const encryptedCandidate = firstDefinedEnv(...encryptedVarNames);
  const keychainCandidate = firstDefinedEnv(...keychainVarNames);

  let encryptedValue = encryptedCandidate.value;
  let encryptedVarName = encryptedCandidate.name;
  let keychainValue = keychainCandidate.value;
  let keychainVarName = keychainCandidate.name;

  // Handle swapped env naming: if ciphertext/keychain were stored in opposite vars,
  // infer by base64 shape and swap before
  if (!looksLikeBase64(encryptedValue) && looksLikeBase64(keychainValue)) {
    encryptedValue = keychainCandidate.value;
    encryptedVarName = keychainCandidate.name;
    keychainValue = encryptedCandidate.value;
    keychainVarName = encryptedCandidate.name;
  }

  const { key, iv } = getKeyIvFromKeychain(keychainValue, keychainVarName);
  return decryptAesBase64({ encryptedValue, key, iv, valueName: valueName || encryptedVarName });
};

const dbMode = (process.env.DB_MODE || "local").toLowerCase();
const useProductionDb = dbMode === "production";

const localDbConfig = {
  DB_NAME: stripWrappingQuotes(process.env.DB_NAME),
  DB_USER: stripWrappingQuotes(process.env.DB_USER),
  DB_PASSWORD: stripWrappingQuotes(process.env.DB_PASSWORD),
  DB_HOST: stripWrappingQuotes(process.env.DB_HOST || "localhost"),
  DB_PORT: stripWrappingQuotes(process.env.DB_PORT || 3306),
};

const productionDbConfig = useProductionDb
  ? {
      DB_NAME: decryptFromEnv({
        encryptedVarNames: [
          "INF_STERLLO_CONSOLE_DATABASE_NAME_KEYCHAIN",
          "INF_STERLLO_CONSOLE_DATABASE_NAME_KEY",
        ],
        keychainVarNames: ["DB_NAME_KEY", "DB_NAME_KEYCHAIN"],
      }),
      DB_USER: decryptFromEnv({
        encryptedVarNames: [
          "INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEYCHAIN",
          "INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEY",
        ],
        keychainVarNames: ["DB_USERNAME_KEY", "DB_USERNAME_KEYCHAIN"],
      }),
      DB_PASSWORD: decryptFromEnv({
        encryptedVarNames: [
          "INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEYCHAIN",
          "INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEY",
        ],
        keychainVarNames: ["DB_PASSWORD_KEY", "DB_PASSWORD_KEYCHAIN"],
      }),
      DB_HOST: decryptFromEnv({
        encryptedVarNames: [
          "INF_STERLLO_CONSOLE_DATABASE_HOST_KEYCHAIN",
          "INF_STERLLO_CONSOLE_DATABASE_HOST_KEY",
        ],
        keychainVarNames: ["DB_HOST_KEY", "DB_HOST_KEYCHAIN"],
      }),
      DB_PORT: stripWrappingQuotes(process.env.DB_PORT || 3306),
    }
  : null;

const activeDbConfig = useProductionDb ? productionDbConfig : localDbConfig;

export const env = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,

  DB_NAME: activeDbConfig.DB_NAME,
  DB_USER: activeDbConfig.DB_USER,
  DB_PASSWORD: activeDbConfig.DB_PASSWORD,
  DB_HOST: activeDbConfig.DB_HOST,
  DB_PORT: activeDbConfig.DB_PORT,
  DB_DIALECT: process.env.DB_DIALECT || "mysql",
  DB_MODE: dbMode,
  USE_PRODUCTION_DB: useProductionDb,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
};