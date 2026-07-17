import dotenv from "dotenv";
import { stripWrappingQuotes, decryptFromPlainPair } from "../utils/decryptProdSecret.js";

dotenv.config();

const firstDefinedEnv = (...names) => {
  for (const name of names) {
    if (process.env[name] !== undefined && process.env[name] !== "") {
      return { value: process.env[name], name };
    }
  }
  return { value: undefined, name: names[0] };
};

const decryptFromEnv = ({ encryptedVarNames, keychainVarNames, valueName }) => {
  const encryptedCandidate = firstDefinedEnv(...encryptedVarNames);
  const keychainCandidate = firstDefinedEnv(...keychainVarNames);

  return decryptFromPlainPair(encryptedCandidate.value, keychainCandidate.value, {
    valueName: valueName || encryptedCandidate.name,
  });
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
const authDbName = stripWrappingQuotes(
  process.env.AUTH_DB_NAME || process.env.CONSOLE_DB_NAME || (useProductionDb ? "console" : activeDbConfig.DB_NAME),
);

export const env = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,

  DB_NAME: activeDbConfig.DB_NAME,
  DB_USER: activeDbConfig.DB_USER,
  DB_PASSWORD: activeDbConfig.DB_PASSWORD,
  DB_HOST: activeDbConfig.DB_HOST,
  DB_PORT: activeDbConfig.DB_PORT,
  AUTH_DB_NAME: authDbName,
  DB_DIALECT: process.env.DB_DIALECT || "mysql",
  DB_MODE: dbMode,
  USE_PRODUCTION_DB: useProductionDb,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
  JWT_ISSUER: process.env.JWT_ISSUER || "sterllo-console",
  JWT_AUDIENCE: process.env.JWT_AUDIENCE || "sterllo-dashboard",

  MFA_ENCRYPTION_KEY: stripWrappingQuotes(process.env.MFA_ENCRYPTION_KEY),
  MFA_ISSUER: process.env.MFA_ISSUER || "Sterllo Console",
  MFA_CHALLENGE_TTL_SECONDS: Number(process.env.MFA_CHALLENGE_TTL_SECONDS || 300),
  MFA_MAX_ATTEMPTS: Number(process.env.MFA_MAX_ATTEMPTS || 5),
  MFA_TOTP_TOLERANCE_SECONDS: Number(process.env.MFA_TOTP_TOLERANCE_SECONDS || 30),
  MFA_RECOVERY_CODE_COUNT: Number(process.env.MFA_RECOVERY_CODE_COUNT || 10),
  AUTH_SESSION_TTL_HOURS: Number(process.env.AUTH_SESSION_TTL_HOURS || 24),
  MFA_RECENT_WINDOW_MINUTES: Number(process.env.MFA_RECENT_WINDOW_MINUTES || 10),
};
