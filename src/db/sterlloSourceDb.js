import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { decryptFromPlainPair, stripWrappingQuotes } from "../utils/decryptProdSecret.js";
import { ErrorClass } from "../utils/errorClass/index.js";

dotenv.config();

const required = (value, name) => {
  const normalized = stripWrappingQuotes(String(value ?? ""));
  if (!normalized) {
    throw new ErrorClass(`${name} is required`, 500);
  }
  return normalized;
};

const decryptRequired = ({ encrypted, keychain, name }) => {
  return decryptFromPlainPair(required(encrypted, name), required(keychain, `${name}_KEYCHAIN`), {
    valueName: name,
  });
};

export const getSterlloSourceConfig = () => {
  const directHost = stripWrappingQuotes(process.env.SOURCE_DB_HOST || "");
  const directName = stripWrappingQuotes(process.env.SOURCE_DB_NAME || "");
  const directUser = stripWrappingQuotes(process.env.SOURCE_DB_USER || "");
  const directPassword = stripWrappingQuotes(process.env.SOURCE_DB_PASSWORD || "");
  const directPort = stripWrappingQuotes(process.env.SOURCE_DB_PORT || "");
  const hasDirectConfig = Boolean(directHost && directName && directUser && directPort);

  if (hasDirectConfig) {
    return {
      host: directHost,
      port: Number(directPort),
      user: directUser,
      password: directPassword,
      database: directName,
      sterlloProductId: required(process.env.STERLLO_PRODUCT_ID, "STERLLO_PRODUCT_ID"),
      sourceProductKey: required(process.env.SOURCE_PRODUCT_KEY, "SOURCE_PRODUCT_KEY"),
    };
  }

  const dbName = decryptRequired({
    encrypted: process.env.SOURCE_DB_NAME_ENCRYPTED || process.env.DB_NAME,
    keychain:
      process.env.SOURCE_DB_NAME_KEYCHAIN ||
      process.env.INF_STERLLO_CONSOLE_DATABASE_NAME_KEYCHAIN ||
      process.env.DB_NAME_KEYCHAIN,
    name: "SOURCE_DB_NAME",
  });

  const dbHost = decryptRequired({
    encrypted: process.env.SOURCE_DB_HOST_ENCRYPTED || process.env.DB_HOST,
    keychain:
      process.env.SOURCE_DB_HOST_KEYCHAIN ||
      process.env.INF_STERLLO_CONSOLE_DATABASE_HOST_KEYCHAIN ||
      process.env.DB_HOST_KEYCHAIN,
    name: "SOURCE_DB_HOST",
  });

  const dbUser = decryptRequired({
    encrypted: process.env.SOURCE_DB_USER_ENCRYPTED || process.env.DB_USERNAME_KEY,
    keychain:
      process.env.SOURCE_DB_USER_KEYCHAIN ||
      process.env.INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEYCHAIN ||
      process.env.DB_USERNAME_KEYCHAIN,
    name: "SOURCE_DB_USER",
  });

  const dbPassword = decryptRequired({
    encrypted: process.env.SOURCE_DB_PASSWORD_ENCRYPTED || process.env.DB_PASSWORD_KEY,
    keychain:
      process.env.SOURCE_DB_PASSWORD_KEYCHAIN ||
      process.env.INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEYCHAIN ||
      process.env.DB_PASSWORD_KEYCHAIN,
    name: "SOURCE_DB_PASSWORD",
  });

  const sourceProductKey =
    process.env.SOURCE_PRODUCT_KEY_KEYCHAIN && process.env.SOURCE_PRODUCT_KEY
      ? decryptRequired({
          encrypted: process.env.SOURCE_PRODUCT_KEY,
          keychain: process.env.SOURCE_PRODUCT_KEY_KEYCHAIN,
          name: "SOURCE_PRODUCT_KEY",
        })
      : stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY || "");

  const targetProductKey =
    process.env.TARGET_PRODUCT_KEY_KEYCHAIN && process.env.TARGET_PRODUCT_KEY
      ? decryptRequired({
          encrypted: process.env.TARGET_PRODUCT_KEY,
          keychain: process.env.TARGET_PRODUCT_KEY_KEYCHAIN,
          name: "TARGET_PRODUCT_KEY",
        })
      : stripWrappingQuotes(process.env.TARGET_PRODUCT_KEY || "");

  return {
    host: dbHost,
    port: Number(stripWrappingQuotes(process.env.SOURCE_DB_PORT || process.env.DB_PORT || 3306)),
    user: dbUser,
    password: dbPassword,
    database: dbName,
    sterlloProductId: required(process.env.STERLLO_PRODUCT_ID, "STERLLO_PRODUCT_ID"),
    sourceProductKey,
    targetProductKey,
  };
};

let sourcePool;

export const getSterlloSourcePool = () => {
  if (!sourcePool) {
    const config = getSterlloSourceConfig();
    sourcePool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return sourcePool;
};

export const verifySterlloSourceConnection = async () => {
  const config = getSterlloSourceConfig();
  const pool = getSterlloSourcePool();
  await pool.query("SELECT 1");

  return {
    connected: true,
    database: config.database,
    host: config.host,
    sterlloProductId: config.sterlloProductId,
  };
};
