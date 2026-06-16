/**
 * Sweep ISVS wire/key variants — prints only response codes (no secrets).
 * Usage: node scripts/beamer-isvs-probe-sweep.mjs
 */
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
import {
  decryptFromPlainPair,
  encryptAesBase64WithExplicitIv,
  encryptFromPlainPair,
  randomAesIv16,
  stripWrappingQuotes,
} from "../src/utils/decryptProdSecret.js";

dotenv.config();

const URL = "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Link";

function env(name, alt) {
  return stripWrappingQuotes(process.env[name] || process.env[alt] || "");
}

function decryptPair(enc, kc, label) {
  if (!enc || !kc) return null;
  try {
    return stripWrappingQuotes(decryptFromPlainPair(enc, kc, { valueName: label }));
  } catch {
    return null;
  }
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

async function probe(label, axiosHeaders, isvsBody, decryptKeys) {
  try {
    const res = await axios.post(URL, isvsBody, { headers: axiosHeaders, validateStatus: () => true });
    const body = summarize(res.data, decryptKeys);
    const code = body?.code ?? res.status;
    const message = body?.message ?? body?.data?.reason ?? "";
    console.log(`${label.padEnd(52)} → code=${code} ${message}`.slice(0, 120));
    return code;
  } catch (e) {
    console.log(`${label.padEnd(52)} → ERROR ${e.message}`);
    return null;
  }
}

async function main() {
  const targetEnc = env("TARGET_PRODUCT_KEY");
  const targetKc = env("TARGET_PRODUCT_KEYCHAIN", "TARGET_PRODUCT_KEY_KEYCHAIN");
  const sourceEnc = env("SOURCE_PRODUCT_KEY");
  const sourceKc = env("SOURCE_PRODUCT_KEY_KEYCHAIN", "SOURCE_PRODUCT_KEYCHAIN");
  const targetPlain = decryptPair(targetEnc, targetKc, "TARGET");
  const sourcePlain = decryptPair(sourceEnc, sourceKc, "SOURCE");

  if (!targetPlain) {
    console.error("Cannot decrypt TARGET_PRODUCT_KEY");
    process.exit(1);
  }

  const plainHeaders = {
    "User-Key": "probe-user-key",
    "Accout-Key": "probe-account-key",
    "Request-Id": crypto.randomUUID(),
  };
  const plainData = {
    account_number: "0000000000",
    client: { id: "probe-client-id", key: "probe-client-key" },
  };

  const decryptKeys = [targetPlain, targetKc, sourcePlain, sourceKc].filter(Boolean);
  const enc = (material, v) => encryptFromPlainPair(String(v), material, { valueName: "f" });

  console.log("Target plain len:", targetPlain.length, "| Target keychain len:", targetKc.length);
  console.log("Source plain len:", sourcePlain?.length ?? 0, "| Source keychain len:", sourceKc.length);
  console.log("Target plain prefix:", targetPlain.slice(0, 14));
  console.log("--- sweep ---\n");

  // 1. Link.json plaintext
  await probe(
    "1 plaintext Link.json + plain Credentials",
    {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      ...plainHeaders,
      Credentials: plainData.client.key,
    },
    plainData,
    decryptKeys,
  );

  await probe(
    "2 plaintext Link.json no Credentials",
    {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      ...plainHeaders,
    },
    plainData,
    decryptKeys,
  );

  // 3. Env ciphertext on product-key headers (not decrypted)
  await probe(
    "3 ciphertext product keys + plain body",
    {
      "Target-Product-Key": targetEnc,
      "Source-Product-Key": sourceEnc || targetEnc,
      ...plainHeaders,
      Credentials: plainData.client.key,
    },
    plainData,
    decryptKeys,
  );

  // 4. Field encrypt with decrypted target key (current default)
  await probe(
    "4 field encrypt key=targetPlain",
    {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      "User-Key": enc(targetPlain, plainHeaders["User-Key"]),
      "Accout-Key": enc(targetPlain, plainHeaders["Accout-Key"]),
      "Request-Id": enc(targetPlain, plainHeaders["Request-Id"]),
      Credentials: enc(targetPlain, plainData.client.key),
    },
    {
      account_number: enc(targetPlain, plainData.account_number),
      client: {
        id: enc(targetPlain, plainData.client.id),
        key: enc(targetPlain, plainData.client.key),
      },
    },
    decryptKeys,
  );

  // 5. Field encrypt with TARGET keychain as AES material
  if (targetKc.length >= 32) {
    await probe(
      "5 field encrypt key=targetKeychain",
      {
        "Target-Product-Key": targetPlain,
        "Source-Product-Key": sourcePlain || targetPlain,
        "User-Key": enc(targetKc, plainHeaders["User-Key"]),
        "Accout-Key": enc(targetKc, plainHeaders["Accout-Key"]),
        "Request-Id": enc(targetKc, plainHeaders["Request-Id"]),
        Credentials: enc(targetKc, plainData.client.key),
      },
      {
        account_number: enc(targetKc, plainData.account_number),
        client: {
          id: enc(targetKc, plainData.client.id),
          key: enc(targetKc, plainData.client.key),
        },
      },
      decryptKeys,
    );
  }

  // 6. Plain HTTP headers + encrypted Credentials only (keychain)
  if (targetKc.length >= 32) {
    await probe(
      "6 plain headers + enc Credentials (keychain)",
      {
        "Target-Product-Key": targetPlain,
        "Source-Product-Key": sourcePlain || targetPlain,
        ...plainHeaders,
        Credentials: enc(targetKc, plainData.client.key),
      },
      plainData,
      decryptKeys,
    );
  }

  // 7. Plain headers + enc Credentials (targetPlain) + plain body
  await probe(
    "7 plain headers + enc Credentials (targetPlain) + plain body",
    {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      ...plainHeaders,
      Credentials: enc(targetPlain, plainData.client.key),
    },
    plainData,
    decryptKeys,
  );

  // 8. Object wire with keychain for body
  if (targetKc.length >= 32) {
    const iv = randomAesIv16();
    await probe(
      "8 object wire AES material=targetKeychain",
      {
        "Target-Product-Key": targetPlain,
        "Source-Product-Key": sourcePlain || targetPlain,
        IV: iv,
        Credentials: encryptAesBase64WithExplicitIv(JSON.stringify(plainHeaders), targetKc, iv, {
          valueName: "h",
        }),
      },
      { data: enc(targetKc, JSON.stringify(plainData)) },
      decryptKeys,
    );
  }

  const plainCredHeaders = {
    "Target-Product-Key": targetPlain,
    "Source-Product-Key": sourcePlain || targetPlain,
    ...plainHeaders,
    Credentials: plainData.client.key,
  };

  // 9–12: link wire — plain headers + plain Credentials + encrypted body ONLY
  await probe("9 LINK: plain hdrs/cred + body enc targetPlain", plainCredHeaders, {
    account_number: enc(targetPlain, plainData.account_number),
    client: {
      id: enc(targetPlain, plainData.client.id),
      key: enc(targetPlain, plainData.client.key),
    },
  }, decryptKeys);

  if (targetKc.length >= 32) {
    await probe("10 LINK: plain hdrs/cred + body enc targetKeychain", plainCredHeaders, {
      account_number: enc(targetKc, plainData.account_number),
      client: {
        id: enc(targetKc, plainData.client.id),
        key: enc(targetKc, plainData.client.key),
      },
    }, decryptKeys);
  }

  if (sourcePlain) {
    await probe("11 LINK: plain hdrs/cred + body enc sourcePlain", plainCredHeaders, {
      account_number: enc(sourcePlain, plainData.account_number),
      client: {
        id: enc(sourcePlain, plainData.client.id),
        key: enc(sourcePlain, plainData.client.key),
      },
    }, decryptKeys);
  }

  if (sourceKc.length >= 32) {
    await probe("12 LINK: plain hdrs/cred + body enc sourceKeychain", plainCredHeaders, {
      account_number: enc(sourceKc, plainData.account_number),
      client: {
        id: enc(sourceKc, plainData.client.id),
        key: enc(sourceKc, plainData.client.key),
      },
    }, decryptKeys);
  }

  // 13–14: encrypted body as single blob in { data: "..." }
  await probe("13 LINK: plain hdrs/cred + {data} blob targetPlain", plainCredHeaders, {
    data: enc(targetPlain, JSON.stringify(plainData)),
  }, decryptKeys);

  if (targetKc.length >= 32) {
    await probe("14 LINK: plain hdrs/cred + {data} blob targetKeychain", plainCredHeaders, {
      data: enc(targetKc, JSON.stringify(plainData)),
    }, decryptKeys);
  }

  // 15–18: headers-only encryption (ISVS reads HTTP headers, not JSON body)
  await probe("15 HDRS: enc headers targetPlain + plain body/cred", {
    "Target-Product-Key": targetPlain,
    "Source-Product-Key": sourcePlain || targetPlain,
    "User-Key": enc(targetPlain, plainHeaders["User-Key"]),
    "Accout-Key": enc(targetPlain, plainHeaders["Accout-Key"]),
    "Request-Id": enc(targetPlain, plainHeaders["Request-Id"]),
    Credentials: plainData.client.key,
  }, plainData, decryptKeys);

  if (targetKc.length >= 32) {
    await probe("16 HDRS: enc headers targetKeychain + plain body/cred", {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      "User-Key": enc(targetKc, plainHeaders["User-Key"]),
      "Accout-Key": enc(targetKc, plainHeaders["Accout-Key"]),
      "Request-Id": enc(targetKc, plainHeaders["Request-Id"]),
      Credentials: plainData.client.key,
    }, plainData, decryptKeys);
  }

  if (sourcePlain) {
    await probe("17 HDRS: enc headers sourcePlain + plain body/cred", {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      "User-Key": enc(sourcePlain, plainHeaders["User-Key"]),
      "Accout-Key": enc(sourcePlain, plainHeaders["Accout-Key"]),
      "Request-Id": enc(sourcePlain, plainHeaders["Request-Id"]),
      Credentials: plainData.client.key,
    }, plainData, decryptKeys);
  }

  if (sourceKc.length >= 32) {
    await probe("18 HDRS: enc headers sourceKeychain + plain body/cred", {
      "Target-Product-Key": targetPlain,
      "Source-Product-Key": sourcePlain || targetPlain,
      "User-Key": enc(sourceKc, plainHeaders["User-Key"]),
      "Accout-Key": enc(sourceKc, plainHeaders["Accout-Key"]),
      "Request-Id": enc(sourceKc, plainHeaders["Request-Id"]),
      Credentials: plainData.client.key,
    }, plainData, decryptKeys);
  }

  console.log("\n--- how to read ---");
  console.log("4013                    → missing Credentials header");
  console.log("5000 no data found      → plain HTTP headers (tests 1,3,9–14)");
  console.log("5000 decryption failed  → encrypted headers found, wrong key (tests 4–8,15–18)");
  console.log("anything else           → crypto accepted");
  console.log("\nDefault code format is now headers (test 15). Run: node scripts/beamer-isvs-probe.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
