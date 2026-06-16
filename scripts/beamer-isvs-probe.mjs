/**
 * Probe ISVS with current BEAMER_ISVS_WIRE_FORMAT / BEAMER_ISVS_ENCRYPT_KEY settings.
 *
 * Usage:
 *   node scripts/beamer-isvs-probe.mjs
 *   BEAMER_ISVS_ENCRYPT_KEY=target-keychain node scripts/beamer-isvs-probe.mjs
 *   node scripts/beamer-isvs-probe-sweep.mjs   (compare many variants)
 */
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import { decryptFromPlainPair, stripWrappingQuotes } from "../src/utils/decryptProdSecret.js";

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

function summarize(data, decryptKeys) {
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

  const wireFormat = (process.env.BEAMER_ISVS_WIRE_FORMAT || "credentials").toLowerCase();
  const encryptKey = (process.env.BEAMER_ISVS_ENCRYPT_KEY || "target").toLowerCase();
  const encryptMaterial =
    encryptKey === "target-keychain"
      ? targetKc
      : encryptKey === "source"
        ? source || target
        : encryptKey === "source-keychain"
          ? stripWrappingQuotes(
              process.env.SOURCE_PRODUCT_KEYCHAIN || process.env.SOURCE_PRODUCT_KEY_KEYCHAIN || "",
            )
          : target;

  console.log("Wire format:", wireFormat);
  console.log("Encrypt key:", encryptKey);
  console.log("Target plain len:", target.length, "| keychain len:", targetKc.length);
  console.log("Source plain len:", source?.length ?? 0);
  console.log("Probing ISVS...\n");

  const { default: MerchantService } = await import("../src/services/merchants.js");
  const service = new MerchantService();
  const payload = {
    headers: {
      "User-Key": "probe-user-key",
      "Accout-Key": "probe-account-key",
      "Request-Id": crypto.randomUUID(),
    },
    data: {
      account_number: "0000000000",
      client: { id: "probe-client-id", key: "probe-client-key" },
    },
  };

  // Use service path end-to-end (same as production proxy)
  const material = {
    sourceProductKey: stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY || ""),
    targetProductKey: stripWrappingQuotes(process.env.TARGET_PRODUCT_KEY || ""),
    sourceProductKeyKeychain: stripWrappingQuotes(
      process.env.SOURCE_PRODUCT_KEYCHAIN || process.env.SOURCE_PRODUCT_KEY_KEYCHAIN || "",
    ),
    targetProductKeyKeychain: targetKc,
  };

  // Minimal inline build via duplicated logic — call linkBeamer would need DB merchant.
  // Import internal build through a fake account by using extract + build from module scope isn't exported.
  // Fall back: dynamic import merchants and invoke via eval of exported class method with mock — skip, use direct axios with same env-driven helpers duplicated in probe-sweep.

  const mod = await import("../src/services/merchants.js");
  void mod;
  void service;

  const { encryptFromPlainPair, encryptAesBase64WithExplicitIv, randomAesIv16 } = await import(
    "../src/utils/decryptProdSecret.js"
  );
  const enc = (v) => encryptFromPlainPair(String(v), encryptMaterial, { valueName: "field" });
  const plainHeaders = payload.headers;
  const plainData = payload.data;

  let axiosHeaders;
  let isvsBody;

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
  } else if (wireFormat === "enc-body" || wireFormat === "link") {
    axiosHeaders = {
      "Target-Product-Key": target,
      "Source-Product-Key": source || target,
      ...plainHeaders,
      Credentials: plainData.client.key,
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

  const res = await axios.post(URL, isvsBody, { headers: axiosHeaders, validateStatus: () => true });
  const body = summarize(res.data, [target, targetKc, source].filter(Boolean));

  console.log("HTTP status:", res.status);
  console.log("ISVS body:", JSON.stringify(body, null, 2));
  console.log("\nMessages seen in sweep:");
  console.log('- "No data found to decrypt" → plain Credentials (nothing for ISVS to decrypt)');
  console.log('- "Decryption failed" → encrypted Credentials found but wrong AES key');
  console.log("- 4013 → missing Credentials header");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
