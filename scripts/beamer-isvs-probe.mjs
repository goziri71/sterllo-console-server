/**
 * Probe ISVS with current BEAMER_ISVS_WIRE_FORMAT / BEAMER_ISVS_ENCRYPT_KEY settings.
 *
 * Usage:
 *   node scripts/beamer-isvs-probe.mjs
 *   BEAMER_ISVS_ENCRYPT_KEY=source node scripts/beamer-isvs-probe.mjs
 *   node scripts/beamer-isvs-probe-sweep.mjs   (compare legacy variants)
 */
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import { decryptFromPlainPair, encryptAesBase64WithExplicitIv, encryptFromPlainPair, randomAesIv16, stripWrappingQuotes } from "../src/utils/decryptProdSecret.js";
import {
  buildIsvsCredentialsHeader,
  decryptIsvsJson,
  encryptIsvsJson,
  generateIsvsIv,
  resolveIsvsEncryptionKey,
  splitIsvsCredentialsHeader,
} from "../src/utils/isvsCryptoJs.js";

dotenv.config();

const URL = "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Link";

function decryptEnvKey(encName, kcNames) {
  const enc = stripWrappingQuotes(process.env[encName] || "");
  let kc = "";
  for (const name of kcNames) {
    kc = stripWrappingQuotes(process.env[name] || "");
    if (kc) break;
  }
  if (!enc || !kc) return null;
  return stripWrappingQuotes(decryptFromPlainPair(enc, kc, { valueName: encName }));
}

function summarizeEncryptedApiCall(data, credentialsHeader, encryptionKey) {
  if (!data || typeof data !== "object") return data;
  if (typeof data.response !== "string" || !credentialsHeader) return data;
  try {
    const { iv } = splitIsvsCredentialsHeader(credentialsHeader);
    return decryptIsvsJson(data.response, encryptionKey, iv);
  } catch {
    return { wrapped: true };
  }
}

function summarizeLegacy(data, decryptKeys) {
  if (!data || typeof data !== "object") return data;
  if (typeof data.response !== "string") return data;
  for (const key of decryptKeys) {
    if (!key) continue;
    try {
      return JSON.parse(decryptFromPlainPair(data.response, key, { valueName: "resp" }));
    } catch {
      /* try next */
    }
  }
  return { wrapped: true };
}

async function main() {
  const target = decryptEnvKey("TARGET_PRODUCT_KEY", [
    "TARGET_PRODUCT_KEYCHAIN",
    "TARGET_PRODUCT_KEY_KEYCHAIN",
  ]);
  const source = decryptEnvKey("SOURCE_PRODUCT_KEY", [
    "SOURCE_PRODUCT_KEYCHAIN",
    "SOURCE_PRODUCT_KEY_KEYCHAIN",
  ]);
  const targetKc = stripWrappingQuotes(
    process.env.TARGET_PRODUCT_KEYCHAIN || process.env.TARGET_PRODUCT_KEY_KEYCHAIN || "",
  );

  if (!target) {
    console.error("Could not decrypt TARGET_PRODUCT_KEY — check .env");
    process.exit(1);
  }

  const wireFormat = (process.env.BEAMER_ISVS_WIRE_FORMAT || "cryptojs").toLowerCase();
  const encryptKeyChoice = (process.env.BEAMER_ISVS_ENCRYPT_KEY || "target").toLowerCase();
  const encryptionKey = resolveIsvsEncryptionKey(
    encryptKeyChoice === "source" ? source || target : target,
  );

  console.log("Wire format:", wireFormat);
  console.log("Encrypt key:", encryptKeyChoice);
  console.log("Encryption key (first 32):", encryptionKey);
  console.log("Target plain len:", target.length, "| Source plain len:", source?.length ?? 0);
  console.log("Probing ISVS...\n");

  const plainHeaders = {
    "User-Key": "probe-user-key",
    "Accout-Key": "probe-account-key",
    "Request-Id": crypto.randomUUID(),
  };
  const plainData = {
    account_number: "0000000000",
    client: { id: "probe-client-id", key: "probe-client-key" },
  };

  let axiosHeaders;
  let isvsBody;

  if (wireFormat === "cryptojs") {
    const iv = generateIsvsIv();
    const credentialsObject = {
      "Source-Product-Key": source || target,
      "Target-Product-Key": target,
      "User-Key": plainHeaders["User-Key"],
      "Account-Key": plainHeaders["Accout-Key"],
      "Request-Id": plainHeaders["Request-Id"],
    };
    axiosHeaders = {
      Credentials: buildIsvsCredentialsHeader(credentialsObject, encryptionKey, iv),
      "Content-Type": "application/json",
    };
    isvsBody = { payload: encryptIsvsJson(plainData, encryptionKey, iv) };
  } else {
    const encryptMaterial =
      encryptKeyChoice === "source"
        ? source || target
        : encryptKeyChoice === "source-keychain"
          ? stripWrappingQuotes(
              process.env.SOURCE_PRODUCT_KEYCHAIN || process.env.SOURCE_PRODUCT_KEY_KEYCHAIN || "",
            )
          : encryptKeyChoice === "target-keychain"
            ? targetKc
            : target;
    const enc = (v) => encryptFromPlainPair(String(v), encryptMaterial, { valueName: "field" });

    if (wireFormat === "object") {
      const iv = randomAesIv16();
      axiosHeaders = {
        "Target-Product-Key": target,
        "Source-Product-Key": source || target,
        IV: iv,
        Credentials: encryptAesBase64WithExplicitIv(JSON.stringify(plainHeaders), encryptMaterial, iv, {
          valueName: "headers",
        }),
      };
      isvsBody = { data: enc(JSON.stringify(plainData)) };
    } else if (wireFormat === "full-field" || wireFormat === "field") {
      axiosHeaders = {
        "Target-Product-Key": target,
        "Source-Product-Key": source || target,
        "User-Key": enc(plainHeaders["User-Key"]),
        "Accout-Key": enc(plainHeaders["Accout-Key"]),
        "Request-Id": enc(plainHeaders["Request-Id"]),
        Credentials: enc(plainData.client.key),
      };
      isvsBody = {
        account_number: enc(plainData.account_number),
        client: { id: enc(plainData.client.id), key: enc(plainData.client.key) },
      };
    } else if (wireFormat === "headers") {
      axiosHeaders = {
        "Target-Product-Key": target,
        "Source-Product-Key": source || target,
        "User-Key": enc(plainHeaders["User-Key"]),
        "Accout-Key": enc(plainHeaders["Accout-Key"]),
        "Request-Id": enc(plainHeaders["Request-Id"]),
        Credentials: plainData.client.key,
      };
      isvsBody = plainData;
    } else {
      axiosHeaders = {
        "Target-Product-Key": target,
        "Source-Product-Key": source || target,
        ...plainHeaders,
        Credentials: enc(plainData.client.key),
      };
      isvsBody = plainData;
    }
  }

  const res = await axios.post(URL, isvsBody, { headers: axiosHeaders, validateStatus: () => true });
  const body =
    wireFormat === "cryptojs"
      ? summarizeEncryptedApiCall(res.data, axiosHeaders.Credentials, encryptionKey)
      : summarizeLegacy(res.data, [target, source, targetKc].filter(Boolean));

  console.log("HTTP status:", res.status);
  console.log("ISVS body:", JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
