import crypto from "crypto";
import { eq, and, desc, asc, count, ne, or, sql, max, inArray } from "drizzle-orm";
import axios from "axios";
import { db } from "../db/index.js";
import { merchants, merchantLedgers, settlementLedgers } from "../db/schema/merchants.js";
import { udara360APICredentials } from "../db/schema/vendor.js";
import {
  decryptAesBase64WithExplicitIv,
  decryptFromPlainPair,
  encryptAesBase64WithExplicitIv,
  encryptFromPlainPair,
  getKeyIvFromKeychain,
  looksLikeBase64,
  randomAesIv16,
  stripWrappingQuotes,
} from "../utils/decryptProdSecret.js";
import { customers } from "../db/schema/customers.js";
import { kycs } from "../db/schema/kycs.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { isMissingMysqlTableError } from "../utils/mysqlErrors.js";

const SORTABLE_COLUMNS = {
  name: merchants.name,
  trade_name: merchants.trade_name,
  date_created: merchants.date_created,
};

function buildOrderBy(sortBy, order) {
  const column = SORTABLE_COLUMNS[sortBy] || merchants.date_created;
  return order === "asc" ? asc(column) : desc(column);
}

/** Normalize combined environment strings to response `type`: "baas" | "saas" | null */
function merchantTypeFromEnvironments(environmentsCsv) {
  if (!environmentsCsv || typeof environmentsCsv !== "string") return null;
  const parts = [
    ...new Set(
      environmentsCsv
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.includes("baas")) return "baas";
  if (parts.includes("saas")) return "saas";
  return parts[0];
}

function mergeMerchantEnvironments(ledgerEnvsCsv, customerEnvsCsv) {
  const merged = [ledgerEnvsCsv, customerEnvsCsv].filter(Boolean).join(",");
  return merchantTypeFromEnvironments(merged || null);
}

function beamerEnvKeychain(...names) {
  for (const name of names) {
    const value = stripWrappingQuotes(process.env[name] || "");
    if (value) return value;
  }
  return "";
}

function getBeamerProductKeyMaterial() {
  return {
    sourceProductKey: stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY || ""),
    targetProductKey: stripWrappingQuotes(process.env.TARGET_PRODUCT_KEY || ""),
    sourceProductKeyKeychain: beamerEnvKeychain(
      "SOURCE_PRODUCT_KEY_KEYCHAIN",
      "SOURCE_PRODUCT_KEYCHAIN",
    ),
    targetProductKeyKeychain: beamerEnvKeychain(
      "TARGET_PRODUCT_KEY_KEYCHAIN",
      "TARGET_PRODUCT_KEYCHAIN",
    ),
  };
}

/** Env product keys: decrypt ciphertext with its own *_KEYCHAIN (same AES rules as DB secrets). */
function decryptBeamerEnvProductKey(encrypted, keychain, label) {
  const enc = stripWrappingQuotes(String(encrypted ?? "").trim());
  if (!enc) return "";
  const kc = stripWrappingQuotes(String(keychain ?? "").trim());
  if (!kc) return enc;
  return stripWrappingQuotes(decryptFromPlainPair(enc, kc, { valueName: label }));
}

function looksLikeUndecryptedEnvCiphertext(value) {
  const text = stripWrappingQuotes(String(value ?? "").trim());
  return text.length > 80 && looksLikeBase64(text);
}

function resolveBeamerProductKeysFromMaterial(material) {
  const sourceKeychain = stripWrappingQuotes(material.sourceProductKeyKeychain || "");
  const targetKeychain = stripWrappingQuotes(material.targetProductKeyKeychain || "");

  if (!sourceKeychain) {
    throw new ErrorClass("SOURCE_PRODUCT_KEYCHAIN (or SOURCE_PRODUCT_KEY_KEYCHAIN) is required", 500);
  }
  if (!targetKeychain) {
    throw new ErrorClass("TARGET_PRODUCT_KEYCHAIN (or TARGET_PRODUCT_KEY_KEYCHAIN) is required", 500);
  }

  let sourceProductKey;
  let targetProductKey;
  try {
    sourceProductKey = decryptBeamerEnvProductKey(
      material.sourceProductKey,
      sourceKeychain,
      "SOURCE_PRODUCT_KEY",
    );
    targetProductKey = decryptBeamerEnvProductKey(
      material.targetProductKey,
      targetKeychain,
      "TARGET_PRODUCT_KEY",
    );
  } catch (error) {
    throw new ErrorClass(
      `Failed to decrypt Beamer product keys from env: ${error.message}`,
      500,
    );
  }

  if (looksLikeUndecryptedEnvCiphertext(sourceProductKey)) {
    throw new ErrorClass(
      "SOURCE_PRODUCT_KEY is still ciphertext after decrypt — check SOURCE_PRODUCT_KEY and SOURCE_PRODUCT_KEYCHAIN",
      500,
    );
  }
  if (looksLikeUndecryptedEnvCiphertext(targetProductKey)) {
    throw new ErrorClass(
      "TARGET_PRODUCT_KEY is still ciphertext after decrypt — check TARGET_PRODUCT_KEY and TARGET_PRODUCT_KEYCHAIN",
      500,
    );
  }

  return {
    sourceProductKey,
    targetProductKey,
    sourceProductKeyKeychain: sourceKeychain,
    targetProductKeyKeychain: targetKeychain,
  };
}

/**
 * ISVS wire format (BEAMER_ISVS_WIRE_FORMAT):
 * - "credentials" (default): plain Link.json headers + body; encrypt Credentials (client.key) only
 * - "headers": encrypt User-Key/Accout-Key/Request-Id; plain Credentials + plain body
 * - "enc-body": plain headers + plain Credentials + encrypted body
 * - "full-field": encrypt every header/body field + encrypted Credentials
 * - "object": whole headers blob in Credentials + IV; body as { data: encrypted blob }
 *
 * BEAMER_ISVS_ENCRYPT_KEY: target | target-keychain | source | source-keychain (default: target)
 */
function beamerIsvsWireFormat() {
  const format = stripWrappingQuotes(process.env.BEAMER_ISVS_WIRE_FORMAT || "credentials").toLowerCase();
  if (format === "object" || format === "full-field" || format === "field") return format;
  if (format === "enc-body" || format === "link") return "enc-body";
  if (format === "headers") return "headers";
  return "credentials";
}

function resolveIsvsEncryptMaterial(productKeys) {
  const choice = stripWrappingQuotes(process.env.BEAMER_ISVS_ENCRYPT_KEY || "target").toLowerCase();
  if (choice === "target-keychain") return productKeys.targetProductKeyKeychain;
  if (choice === "source") return productKeys.sourceProductKey;
  if (choice === "source-keychain") return productKeys.sourceProductKeyKeychain;
  return productKeys.targetProductKey;
}

function encryptForIsvs(plain, encryptMaterial) {
  const text = stripWrappingQuotes(String(plain ?? "").trim());
  if (!text) return "";
  return encryptFromPlainPair(text, encryptMaterial, { valueName: "ISVS field" });
}

function resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject) {
  const client = asPlainObject(plainDataObject.client) || {};
  const credentialsPlain = pickFirstNonEmpty(
    plainHeadersObject.Credentials,
    plainHeadersObject.credentials,
    client.key,
  );
  if (!credentialsPlain) {
    throw new ErrorClass("data.client.key is required for ISVS Credentials header", 400);
  }
  return credentialsPlain;
}

function buildPlainIsvsLinkBody(plainDataObject) {
  const client = asPlainObject(plainDataObject.client) || {};
  return {
    account_number: beamerHeaderValue(plainDataObject.account_number),
    client: {
      id: beamerHeaderValue(client.id),
      key: beamerHeaderValue(client.key),
    },
  };
}

/** Sweep-proven: ISVS decrypts Credentials header; Link.json headers + body stay plaintext. */
function buildIsvsCredentialsWireLink(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "User-Key": beamerHeaderValue(plainHeadersObject["User-Key"]),
    "Accout-Key": beamerHeaderValue(plainHeadersObject["Accout-Key"]),
    "Request-Id": beamerHeaderValue(plainHeadersObject["Request-Id"]),
    Credentials: encryptForIsvs(credentialsPlain, encryptMaterial),
  };

  const requestIp = beamerHeaderValue(plainHeadersObject["Request-IP-Address"]);
  if (requestIp) {
    axiosHeaders["Request-IP-Address"] = requestIp;
  }

  return {
    axiosHeaders,
    isvsBody: buildPlainIsvsLinkBody(plainDataObject),
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "credentials",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

function buildIsvsCredentialsWireUpdate(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);
  const client = asPlainObject(plainDataObject.client) || {};

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "Request-Id": beamerHeaderValue(plainHeadersObject["Request-Id"]),
    Credentials: encryptForIsvs(credentialsPlain, encryptMaterial),
  };

  const isvsBody = {
    id: beamerHeaderValue(plainDataObject.id),
    account_number: beamerHeaderValue(plainDataObject.account_number),
    client: {
      id: beamerHeaderValue(client.id),
      key: beamerHeaderValue(client.key),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "credentials",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

/** Legacy: encrypt User-Key/Accout-Key/Request-Id; plain Credentials + plain body. */
function buildIsvsHeadersWireLink(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "User-Key": encryptForIsvs(plainHeadersObject["User-Key"], encryptMaterial),
    "Accout-Key": encryptForIsvs(plainHeadersObject["Accout-Key"], encryptMaterial),
    "Request-Id": encryptForIsvs(plainHeadersObject["Request-Id"], encryptMaterial),
    Credentials: credentialsPlain,
  };

  const requestIp = beamerHeaderValue(plainHeadersObject["Request-IP-Address"]);
  if (requestIp) {
    axiosHeaders["Request-IP-Address"] = encryptForIsvs(requestIp, encryptMaterial);
  }

  const isvsBody = buildPlainIsvsLinkBody(plainDataObject);

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "headers",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

function buildIsvsHeadersWireUpdate(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);
  const client = asPlainObject(plainDataObject.client) || {};

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "Request-Id": encryptForIsvs(plainHeadersObject["Request-Id"], encryptMaterial),
    Credentials: credentialsPlain,
  };

  const isvsBody = {
    id: beamerHeaderValue(plainDataObject.id),
    account_number: beamerHeaderValue(plainDataObject.account_number),
    client: {
      id: beamerHeaderValue(client.id),
      key: beamerHeaderValue(client.key),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "headers",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

/** Legacy attempt: plain HTTP headers + encrypted body (ISVS sweep: body crypto not detected). */
function buildIsvsEncBodyWireLink(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "User-Key": beamerHeaderValue(plainHeadersObject["User-Key"]),
    "Accout-Key": beamerHeaderValue(plainHeadersObject["Accout-Key"]),
    "Request-Id": beamerHeaderValue(plainHeadersObject["Request-Id"]),
    Credentials: credentialsPlain,
  };

  const requestIp = beamerHeaderValue(plainHeadersObject["Request-IP-Address"]);
  if (requestIp) {
    axiosHeaders["Request-IP-Address"] = requestIp;
  }

  const isvsBody = {
    account_number: encryptForIsvs(plainDataObject.account_number, encryptMaterial),
    client: {
      id: encryptForIsvs(client.id, encryptMaterial),
      key: encryptForIsvs(client.key, encryptMaterial),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "enc-body",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

function buildIsvsEncBodyWireUpdate(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const credentialsPlain = resolveIsvsCredentialsPlain(plainHeadersObject, plainDataObject);
  const client = asPlainObject(plainDataObject.client) || {};

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "Request-Id": beamerHeaderValue(plainHeadersObject["Request-Id"]),
    Credentials: credentialsPlain,
  };

  const isvsBody = {
    id: encryptForIsvs(plainDataObject.id, encryptMaterial),
    account_number: encryptForIsvs(plainDataObject.account_number, encryptMaterial),
    client: {
      id: encryptForIsvs(client.id, encryptMaterial),
      key: encryptForIsvs(client.key, encryptMaterial),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      wireFormat: "enc-body",
      encryptMaterialKind: process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    },
  };
}

/** Legacy: encrypted HTTP headers + encrypted body fields + encrypted Credentials. */
function buildIsvsFieldWireLink(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const client = asPlainObject(plainDataObject.client) || {};
  const credentialsPlain = pickFirstNonEmpty(
    plainHeadersObject.Credentials,
    plainHeadersObject.credentials,
    client.key,
  );

  if (!credentialsPlain) {
    throw new ErrorClass("data.client.key is required for ISVS Credentials header", 400);
  }

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "User-Key": encryptForIsvs(plainHeadersObject["User-Key"], encryptMaterial),
    "Accout-Key": encryptForIsvs(plainHeadersObject["Accout-Key"], encryptMaterial),
    "Request-Id": encryptForIsvs(plainHeadersObject["Request-Id"], encryptMaterial),
    Credentials: encryptForIsvs(credentialsPlain, encryptMaterial),
  };

  const requestIp = beamerHeaderValue(plainHeadersObject["Request-IP-Address"]);
  if (requestIp) {
    axiosHeaders["Request-IP-Address"] = encryptForIsvs(requestIp, encryptMaterial);
  }

  const isvsBody = {
    account_number: encryptForIsvs(plainDataObject.account_number, encryptMaterial),
    client: {
      id: encryptForIsvs(client.id, encryptMaterial),
      key: encryptForIsvs(client.key, encryptMaterial),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: { headers: plainHeadersObject, data: plainDataObject, wireFormat: "full-field" },
  };
}

function buildIsvsFieldWireUpdate(productKeys, plainHeadersObject, plainDataObject) {
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const client = asPlainObject(plainDataObject.client) || {};
  const credentialsPlain = pickFirstNonEmpty(
    plainHeadersObject.Credentials,
    plainHeadersObject.credentials,
    client.key,
  );

  if (!credentialsPlain) {
    throw new ErrorClass("data.client.key is required for ISVS Credentials header", 400);
  }

  const axiosHeaders = {
    "Target-Product-Key": productKeys.targetProductKey,
    "Source-Product-Key": productKeys.sourceProductKey,
    "Request-Id": encryptForIsvs(plainHeadersObject["Request-Id"], encryptMaterial),
    Credentials: encryptForIsvs(credentialsPlain, encryptMaterial),
  };

  const isvsBody = {
    id: encryptForIsvs(plainDataObject.id, encryptMaterial),
    account_number: encryptForIsvs(plainDataObject.account_number, encryptMaterial),
    client: {
      id: encryptForIsvs(client.id, encryptMaterial),
      key: encryptForIsvs(client.key, encryptMaterial),
    },
  };

  return {
    axiosHeaders,
    isvsBody,
    _isvsPlain: { headers: plainHeadersObject, data: plainDataObject, wireFormat: "full-field" },
  };
}

/**
 * Object wire (experimental): encrypted headers blob in Credentials + random IV;
 * body as { data: encrypted blob }.
 */
function buildIsvsObjectWire(productKeys, plainHeadersObject, plainDataObject) {
  const iv = randomAesIv16();
  const encryptedHeaders = encryptAesBase64WithExplicitIv(
    JSON.stringify(plainHeadersObject),
    productKeys.targetProductKey,
    iv,
    { valueName: "ISVS headers object" },
  );
  const encryptedData = encryptFromPlainPair(
    JSON.stringify(plainDataObject),
    productKeys.targetProductKey,
    { valueName: "ISVS data object" },
  );

  return {
    axiosHeaders: {
      "Target-Product-Key": productKeys.targetProductKey,
      "Source-Product-Key": productKeys.sourceProductKey,
      IV: iv,
      Credentials: encryptedHeaders,
    },
    isvsBody: {
      data: encryptedData,
    },
    _isvsPlain: {
      headers: plainHeadersObject,
      data: plainDataObject,
      iv,
      wireFormat: "object",
    },
  };
}

function buildIsvsOutbound(productKeys, plainHeadersObject, plainDataObject, { link = true } = {}) {
  const format = beamerIsvsWireFormat();
  if (format === "object") {
    return buildIsvsObjectWire(productKeys, plainHeadersObject, plainDataObject);
  }
  if (format === "full-field" || format === "field") {
    return link
      ? buildIsvsFieldWireLink(productKeys, plainHeadersObject, plainDataObject)
      : buildIsvsFieldWireUpdate(productKeys, plainHeadersObject, plainDataObject);
  }
  if (format === "enc-body") {
    return link
      ? buildIsvsEncBodyWireLink(productKeys, plainHeadersObject, plainDataObject)
      : buildIsvsEncBodyWireUpdate(productKeys, plainHeadersObject, plainDataObject);
  }
  if (format === "headers") {
    return link
      ? buildIsvsHeadersWireLink(productKeys, plainHeadersObject, plainDataObject)
      : buildIsvsHeadersWireUpdate(productKeys, plainHeadersObject, plainDataObject);
  }
  return link
    ? buildIsvsCredentialsWireLink(productKeys, plainHeadersObject, plainDataObject)
    : buildIsvsCredentialsWireUpdate(productKeys, plainHeadersObject, plainDataObject);
}

/** Server-side audit: verify we can round-trip decrypt what we send to ISVS. */
function auditIsvsOutboundEncryption(productKeys, outbound) {
  const wireFormat = outbound._isvsPlain?.wireFormat || beamerIsvsWireFormat();
  const encryptMaterial = resolveIsvsEncryptMaterial(productKeys);
  const { key: aesKey, iv: dataIv } = getKeyIvFromKeychain(encryptMaterial, "encryptMaterial");
  const checks = [];

  if (wireFormat === "object") {
    const target = productKeys.targetProductKey;
    const iv = outbound.axiosHeaders.IV;
    try {
      const decrypted = decryptAesBase64WithExplicitIv(
        outbound.axiosHeaders.Credentials,
        target,
        iv,
        { valueName: "Credentials" },
      );
      JSON.parse(decrypted);
      checks.push({ part: "Credentials (object wire, IV header)", ok: true });
    } catch (error) {
      checks.push({
        part: "Credentials (object wire, IV header)",
        ok: false,
        error: error.message,
      });
    }

    try {
      const decrypted = decryptFromPlainPair(outbound.isvsBody.data, target, {
        valueName: "body.data",
      });
      JSON.parse(decrypted);
      checks.push({ part: "body.data (object wire)", ok: true });
    } catch (error) {
      checks.push({
        part: "body.data (object wire)",
        ok: false,
        error: error.message,
      });
    }
  } else {
    if (wireFormat === "full-field" || wireFormat === "field") {
      for (const [name, value] of Object.entries(outbound.axiosHeaders)) {
        if (name === "Target-Product-Key" || name === "Source-Product-Key") continue;
        try {
          decryptFromPlainPair(value, encryptMaterial, { valueName: name });
          checks.push({ part: `HTTP header ${name}`, ok: true });
        } catch (error) {
          checks.push({ part: `HTTP header ${name}`, ok: false, error: error.message });
        }
      }
    } else if (wireFormat === "headers") {
      for (const name of ["User-Key", "Accout-Key", "Request-Id", "Request-IP-Address"]) {
        const value = outbound.axiosHeaders[name];
        if (!value) continue;
        try {
          decryptFromPlainPair(value, encryptMaterial, { valueName: name });
          checks.push({ part: `HTTP header ${name}`, ok: true });
        } catch (error) {
          checks.push({ part: `HTTP header ${name}`, ok: false, error: error.message });
        }
      }
      checks.push({
        part: "Credentials (plaintext client.key)",
        ok: Boolean(outbound.axiosHeaders.Credentials),
      });
      checks.push({ part: "body (plaintext Link.json)", ok: true });
    } else if (wireFormat === "credentials") {
      checks.push({ part: "HTTP headers (credentials wire, plaintext)", ok: true });
      try {
        decryptFromPlainPair(outbound.axiosHeaders.Credentials, encryptMaterial, {
          valueName: "Credentials",
        });
        checks.push({ part: "Credentials (encrypted client.key)", ok: true });
      } catch (error) {
        checks.push({
          part: "Credentials (encrypted client.key)",
          ok: false,
          error: error.message,
        });
      }
      checks.push({ part: "body (plaintext Link.json)", ok: true });
    } else if (wireFormat === "enc-body") {
      checks.push({ part: "HTTP headers (enc-body, plaintext)", ok: true });
      checks.push({
        part: "Credentials (enc-body, plaintext client.key)",
        ok: Boolean(outbound.axiosHeaders.Credentials),
      });
    }

    if (wireFormat !== "headers" && wireFormat !== "credentials") {
      const body = outbound.isvsBody || {};
      const fieldChecks = [
        ["account_number", body.account_number],
        ["client.id", body.client?.id],
        ["client.key", body.client?.key],
        ["id", body.id],
      ];
      for (const [name, value] of fieldChecks) {
        if (!value) continue;
        try {
          decryptFromPlainPair(value, encryptMaterial, { valueName: name });
          checks.push({ part: `body.${name}`, ok: true });
        } catch (error) {
          checks.push({ part: `body.${name}`, ok: false, error: error.message });
        }
      }
    }
  }

  return {
    wireFormat,
    encryptMaterialKind: outbound._isvsPlain?.encryptMaterialKind || process.env.BEAMER_ISVS_ENCRYPT_KEY || "target",
    isvsUrl: null,
    targetKeyLength: productKeys.targetProductKey.length,
    targetKeyPreview: `${productKeys.targetProductKey.slice(0, 12)}…${productKeys.targetProductKey.slice(-4)}`,
    aesKeyPreview: `${aesKey.slice(0, 8)}…`,
    dataIvPreview: `${dataIv.slice(0, 4)}…${dataIv.slice(-4)}`,
    requestIv: outbound.axiosHeaders.IV || null,
    httpHeaderNames: Object.keys(outbound.axiosHeaders),
    bodyShape: Object.keys(outbound.isvsBody || {}),
    credentialsLength: String(outbound.axiosHeaders.Credentials || "").length,
    plainHeaderKeys: Object.keys(outbound._isvsPlain?.headers || {}),
    plainDataKeys: Object.keys(outbound._isvsPlain?.data || {}),
    selfDecryptChecks: checks,
    allSelfDecryptOk: checks.every((c) => c.ok),
  };
}

function logBeamerIsvsOutbound(label, audit, extra = {}) {
  console.warn(`[beamer-isvs] ${label}`, JSON.stringify({ ...audit, ...extra }));
}

function stripIsvsOutboundDebug(outbound) {
  const { axiosHeaders, isvsBody } = outbound;
  return { axiosHeaders, isvsBody };
}

const ISVS_BEAMER_LINK_URL =
  "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Link";
const ISVS_BEAMER_UPDATE_URL =
  "https://api.isvs.sterllo.com/1.202510.0/Integrations/Beamer/Account/Update";

/** Plain header object (encrypted as one blob before ISVS). Excludes product keys. */
function buildPlainBeamerLinkHeaders(requestHeaders) {
  const h = asPlainObject(requestHeaders) || {};

  const inner = {
    "User-Key": beamerHeaderValue(h["User-Key"]),
    "Accout-Key": beamerHeaderValue(h["Accout-Key"]),
    "Request-Id": pickFirstNonEmpty(h["Request-Id"], crypto.randomUUID()),
  };

  const requestIp = beamerHeaderValue(h["Request-IP-Address"]);
  if (requestIp) {
    inner["Request-IP-Address"] = requestIp;
  }

  return inner;
}

function buildPlainBeamerUpdateHeaders(requestHeaders) {
  const h = asPlainObject(requestHeaders) || {};
  return {
    "Request-Id": pickFirstNonEmpty(h["Request-Id"], crypto.randomUUID()),
  };
}

function beamerHeaderValue(raw) {
  return stripWrappingQuotes(String(raw ?? "").trim());
}

function extractBeamerLinkRequest(payload, merchant = null) {
  const body = asPlainObject(payload) || {};
  const headers = asPlainObject(body.headers) || asPlainObject(body.header);
  const data = asPlainObject(body.data);

  if (!headers) {
    throw new ErrorClass("request.headers is required (ISVS Link contract)", 400);
  }
  if (!data) {
    throw new ErrorClass("request.data is required (ISVS Link contract)", 400);
  }
  if (!asPlainObject(data.client)) {
    throw new ErrorClass("request.data.client is required (ISVS Link contract)", 400);
  }

  if (merchant) {
    if (!beamerHeaderValue(headers["User-Key"])) {
      headers["User-Key"] = merchant.user_key;
    }
    if (!beamerHeaderValue(headers["Accout-Key"])) {
      headers["Accout-Key"] = merchant.account_key;
    }
  }

  return { headers, data };
}

function extractBeamerUpdateRequest(payload) {
  const body = asPlainObject(payload) || {};
  const headers = asPlainObject(body.headers) || asPlainObject(body.header);
  const data = asPlainObject(body.data);

  if (!headers) {
    throw new ErrorClass("request.headers is required (ISVS Update contract)", 400);
  }
  if (!data) {
    throw new ErrorClass("request.data is required (ISVS Update contract)", 400);
  }
  if (!asPlainObject(data.client)) {
    throw new ErrorClass("request.data.client is required (ISVS Update contract)", 400);
  }

  return { headers, data };
}

function getBeamerProductKeys() {
  const material = getBeamerProductKeyMaterial();
  const productKeys = resolveBeamerProductKeysFromMaterial(material);
  return { ...material, ...productKeys };
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function pickFirstNonEmpty(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return "";
}

function coerceIsvsPayload(raw) {
  if (raw == null) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function isvsEncryptedBlob(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (typeof payload.response === "string" && payload.response.trim()) return payload.response.trim();
  const inner = payload.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    if (typeof inner.response === "string" && inner.response.trim()) return inner.response.trim();
  }
  return null;
}

function parseDecryptedIsvsPlain(plain) {
  const trimmed = stripWrappingQuotes(String(plain ?? "").trim());
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* fall through */
  }
  return coerceIsvsPayload(trimmed);
}

function collectIsvsResponseDecryptAttempts(encrypted, keys = {}, outboundHeaders = {}, material = {}) {
  const attempts = [];
  const seen = new Set();
  const push = (enc, kc) => {
    const e = stripWrappingQuotes(String(enc ?? "").trim());
    const k = stripWrappingQuotes(String(kc ?? "").trim());
    if (!e || !k || k.length < 32) return;
    const id = `${e}|${k}`;
    if (seen.has(id)) return;
    seen.add(id);
    attempts.push([e, k]);
  };

  const resolved = resolveBeamerProductKeysFromMaterial(material);

  // ISVS encrypts link/update responses with the decrypted Target product key string.
  push(encrypted, resolved.targetProductKey);
  push(encrypted, resolved.sourceProductKey);
  push(encrypted, outboundHeaders["Target-Product-Key"]);
  push(encrypted, outboundHeaders["Source-Product-Key"]);
  push(encrypted, keys.targetProductKey);
  push(encrypted, keys.sourceProductKey);
  push(encrypted, keys.targetProductKeyKeychain);
  push(encrypted, keys.sourceProductKeyKeychain);
  push(encrypted, material.targetProductKeyKeychain);
  push(encrypted, material.sourceProductKeyKeychain);
  push(material.targetProductKey, material.targetProductKeyKeychain);
  push(material.sourceProductKey, material.sourceProductKeyKeychain);
  push(material.targetProductKey, material.sourceProductKeyKeychain);
  push(material.sourceProductKey, material.targetProductKeyKeychain);

  return attempts;
}

function tryDecryptIsvsResponse(raw, productKeys = {}, outboundHeaders = {}) {
  const payload = coerceIsvsPayload(raw);
  const encrypted = isvsEncryptedBlob(payload);
  if (!encrypted) return payload;

  const material = getBeamerProductKeyMaterial();
  for (const [enc, keychain] of collectIsvsResponseDecryptAttempts(
    encrypted,
    productKeys,
    outboundHeaders,
    material,
  )) {
    try {
      const plain = decryptFromPlainPair(enc, keychain, { valueName: "ISVS response" });
      const parsed = parseDecryptedIsvsPlain(plain);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !isvsEncryptedBlob(parsed)) {
        return parsed;
      }
    } catch {
      /* try next keychain */
    }
  }

  return payload;
}

function resolveIsvsHttpStatus(_isvsBody, axiosStatus) {
  // ISVS business codes (e.g. 4013 "Request denied") are not HTTP statuses.
  // Mapping 4013 → HTTP 401 makes browsers/axios clients treat it as JWT failure and log the user out.
  const status = Number(axiosStatus);
  if (Number.isFinite(status) && status >= 100 && status < 600) {
    return status;
  }
  return 502;
}

/** Beamer link/update: always return upstream JSON + HTTP status (never a console error envelope). */
function buildIsvsUpstreamResult(body, axiosStatus) {
  return {
    httpStatus: resolveIsvsHttpStatus(body, axiosStatus),
    body,
  };
}

/** Return ISVS axios response; decrypt `{ response }` wrapper when present, then passthrough body. */
function isvsAxiosResult(response, productKeys, outboundHeaders) {
  const body = tryDecryptIsvsResponse(response.data, productKeys, outboundHeaders);
  return buildIsvsUpstreamResult(body, response.status);
}

function isvsResultFromAxiosError(error, productKeys, outboundHeaders) {
  const status = error?.response?.status;
  const raw = error?.response?.data ?? null;
  const body =
    raw != null && productKeys
      ? tryDecryptIsvsResponse(raw, productKeys, outboundHeaders)
      : raw;
  return buildIsvsUpstreamResult(body, status);
}

const UDARA360_PUBLIC = {
  id: udara360APICredentials.id,
  identifier: udara360APICredentials.identifier,
  account_number: udara360APICredentials.account_number,
  auth_type: udara360APICredentials.auth_type,
  client_id: udara360APICredentials.client_id,
  expiry_date: udara360APICredentials.expiry_date,
  date_created: udara360APICredentials.date_created,
  date_modified: udara360APICredentials.date_modified,
  account_key: udara360APICredentials.account_key,
};

function shapeUdaraPublic(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    identifier: row.identifier,
    account_number: row.account_number,
    auth_type: row.auth_type,
    client_id: row.client_id,
    expiry_date: row.expiry_date,
    date_created: row.date_created,
    date_modified: row.date_modified,
  };
}

function isMissingUdaraTableError(e) {
  return isMissingMysqlTableError(e);
}

/** Latest credential row per account_key (for listing/detail); avoids fragile nested LEFT JOIN SQL. */
async function fetchLatestUdaraMap(accountKeys) {
  const map = new Map();
  const unique = [...new Set(accountKeys.filter(Boolean))];
  if (unique.length === 0) return map;

  try {
    const grouped = await db
      .select({
        account_key: udara360APICredentials.account_key,
        max_id: max(udara360APICredentials.id),
      })
      .from(udara360APICredentials)
      .where(inArray(udara360APICredentials.account_key, unique))
      .groupBy(udara360APICredentials.account_key);

    if (grouped.length === 0) return map;

    const ids = grouped.map((g) => g.max_id).filter((id) => id != null);
    if (ids.length === 0) return map;

    const detailRows = await db
      .select(UDARA360_PUBLIC)
      .from(udara360APICredentials)
      .where(inArray(udara360APICredentials.id, ids));

    for (const row of detailRows) {
      map.set(row.account_key, shapeUdaraPublic(row));
    }
    return map;
  } catch (e) {
    if (isMissingUdaraTableError(e)) return map;
    throw e;
  }
}

async function fetchLatestUdaraOne(accountKey) {
  try {
    const [row] = await db
      .select(UDARA360_PUBLIC)
      .from(udara360APICredentials)
      .where(eq(udara360APICredentials.account_key, accountKey))
      .orderBy(desc(udara360APICredentials.id))
      .limit(1);
    return shapeUdaraPublic(row);
  } catch (e) {
    if (isMissingUdaraTableError(e)) return null;
    throw e;
  }
}

async function enrichWithCounts(rows) {
  if (rows.length === 0) return rows;

  const accountKeys = rows.map((r) => r.account_key);
  const accountKeyList = sql.join(accountKeys.map((k) => sql`${k}`), sql`,`);

  const [ledgerCounts, settlementCounts, customerEnvCounts] = await Promise.all([
    db.execute(
      sql`SELECT account_key, COUNT(*) as ledger_count, GROUP_CONCAT(DISTINCT currency_code) as currencies, GROUP_CONCAT(DISTINCT NULLIF(TRIM(LOWER(environment)), '')) as environments FROM MerchantLedgers WHERE account_key IN (${accountKeyList}) GROUP BY account_key`,
    ),
    db.execute(
      sql`SELECT account_key, COUNT(*) as settlement_count FROM SettlementLedgers WHERE account_key IN (${accountKeyList}) GROUP BY account_key`,
    ),
    db.execute(sql`
      SELECT account_key, GROUP_CONCAT(DISTINCT env) AS environments
      FROM (
        SELECT account_key, NULLIF(TRIM(LOWER(environment)), '') AS env
        FROM Customers
        WHERE account_key IN (${accountKeyList})
        UNION ALL
        SELECT c.account_key, NULLIF(TRIM(LOWER(cw.environment)), '') AS env
        FROM Customers c
        INNER JOIN CustomerWallets cw ON cw.identifier = c.identifier
        WHERE c.account_key IN (${accountKeyList})
      ) x
      WHERE env IS NOT NULL AND env <> ''
      GROUP BY account_key
    `),
  ]);

  const ledgRows = Array.isArray(ledgerCounts[0]) ? ledgerCounts[0] : ledgerCounts;
  const settRows = Array.isArray(settlementCounts[0]) ? settlementCounts[0] : settlementCounts;
  const custEnvRows = Array.isArray(customerEnvCounts[0]) ? customerEnvCounts[0] : customerEnvCounts;

  const ledgMap = new Map();
  for (const l of ledgRows) {
    ledgMap.set(l.account_key, {
      ledger_count: Number(l.ledger_count),
      currencies: l.currencies ? l.currencies.split(",") : [],
      environments: l.environments,
    });
  }

  const custEnvMap = new Map();
  for (const e of custEnvRows) custEnvMap.set(e.account_key, e.environments);

  const settMap = new Map();
  for (const s of settRows) settMap.set(s.account_key, Number(s.settlement_count));

  return rows.map((row) => {
    const ledgerPart = ledgMap.get(row.account_key);
    const type = mergeMerchantEnvironments(ledgerPart?.environments, custEnvMap.get(row.account_key));
    return {
      ...row,
      ledger_count: ledgerPart?.ledger_count ?? 0,
      currencies: ledgerPart?.currencies ?? [],
      type,
      settlement_count: settMap.get(row.account_key) ?? 0,
    };
  });
}

export default class MerchantService {
  async getAll({ limit, offset, filters, sortBy, order }) {
    const conditions = [];
    if (filters.name) conditions.push(sql`${merchants.name} LIKE ${`%${filters.name}%`}`);
    if (filters.trade_name) conditions.push(sql`${merchants.trade_name} LIKE ${`%${filters.trade_name}%`}`);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderClause = buildOrderBy(sortBy, order);

    const [merchantRows, [{ total }]] = await Promise.all([
      db.select().from(merchants).where(where).limit(limit).offset(offset).orderBy(orderClause),
      db.select({ total: count() }).from(merchants).where(where),
    ]);

    const udaraMap = await fetchLatestUdaraMap(merchantRows.map((r) => r.account_key));
    const rows = merchantRows.map((r) => ({
      ...r,
      udara360: udaraMap.get(r.account_key) ?? null,
    }));
    const enriched = await enrichWithCounts(rows);

    return { count: Number(total), rows: enriched };
  }

  async getByAccountKey(accountKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const udara360 = await fetchLatestUdaraOne(accountKey);
    const enriched = await enrichWithCounts([{ ...merchant, udara360 }]);
    return enriched[0];
  }

  async getStats() {
    const [
      [{ total: totalMerchants }],
      [{ total: totalCustomers }],
      [{ total: kycPending }],
      [{ total: restrictedAccounts }],
    ] = await Promise.all([
      db.select({ total: count() }).from(merchants),
      db.select({ total: count() }).from(customers),
      db.select({ total: count() }).from(kycs).where(ne(kycs.is_compliant, "Y")),
      db
        .select({ total: count() })
        .from(customers)
        .where(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y"))),
    ]);

    return {
      total_merchants: Number(totalMerchants),
      total_customers: Number(totalCustomers),
      kyc_pending: Number(kycPending),
      restricted_accounts: Number(restrictedAccounts),
    };
  }

  async update(accountKey, data) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const allowedFields = ["name", "trade_name", "default_kyc_tier"];
    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] === undefined) continue;
      if (field === "default_kyc_tier") {
        const n = Number(data[field]);
        if (!Number.isInteger(n) || n < 1 || n > 3) {
          throw new ErrorClass("default_kyc_tier must be 1, 2, or 3", 400);
        }
        updateData[field] = n;
        continue;
      }
      updateData[field] = data[field];
    }

    if (Object.keys(updateData).length === 0) {
      throw new ErrorClass("No valid fields to update", 400);
    }

    updateData.date_modified = new Date();
    await db
      .update(merchants)
      .set(updateData)
      .where(eq(merchants.account_key, accountKey));

    const [updated] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    return updated;
  }

  /** Sets merchant default KYC tier for new/onboarding flows (1–3). Column: `Merchants.default_kyc_tier`. */
  async setDefaultKycTier(accountKey, tier) {
    if (tier === undefined) {
      throw new ErrorClass("tier is required", 400);
    }
    return this.update(accountKey, { default_kyc_tier: tier });
  }

  async getLedgers(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(merchantLedgers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(merchantLedgers).where(where).limit(limit).offset(offset).orderBy(desc(merchantLedgers.date_created)),
      db.select({ total: count() }).from(merchantLedgers).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getSettlements(accountKey, { limit, offset }) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const where = eq(settlementLedgers.account_key, accountKey);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(settlementLedgers).where(where).limit(limit).offset(offset).orderBy(desc(settlementLedgers.date_created)),
      db.select({ total: count() }).from(settlementLedgers).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async linkBeamerAccount(accountKey, payload) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const productKeyMaterial = getBeamerProductKeyMaterial();
    const productKeys = resolveBeamerProductKeysFromMaterial(productKeyMaterial);
    const { headers, data } = extractBeamerLinkRequest(payload, merchant);
    const plainHeaders = buildPlainBeamerLinkHeaders(headers);
    const outbound = buildIsvsOutbound(productKeys, plainHeaders, data, { link: true });
    const audit = auditIsvsOutboundEncryption(productKeys, outbound);
    audit.isvsUrl = ISVS_BEAMER_LINK_URL;

    if (process.env.BEAMER_ISVS_DEBUG === "true") {
      logBeamerIsvsOutbound("outbound (link)", audit);
    }

    const { axiosHeaders, isvsBody } = stripIsvsOutboundDebug(outbound);

    try {
      const response = await axios.post(ISVS_BEAMER_LINK_URL, isvsBody, {
        headers: axiosHeaders,
        validateStatus: () => true,
      });
      const result = isvsAxiosResult(response, productKeys, axiosHeaders);

      if (result.body?.code === 5000) {
        logBeamerIsvsOutbound("ISVS decryption failed (link)", audit, {
          isvsCode: result.body.code,
          isvsMessage: result.body.message,
          hint:
            audit.allSelfDecryptOk
              ? "Console round-trip decrypt succeeded — ISVS likely expects a different wire format or key material."
              : "Console round-trip decrypt failed — fix local encryption before retrying ISVS.",
        });
      }

      return result;
    } catch (error) {
      if (error instanceof ErrorClass) throw error;
      return isvsResultFromAxiosError(error, productKeys, axiosHeaders);
    }
  }

  async updateBeamerAccount(accountKey, payload) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const productKeyMaterial = getBeamerProductKeyMaterial();
    const productKeys = resolveBeamerProductKeysFromMaterial(productKeyMaterial);
    const { headers, data } = extractBeamerUpdateRequest(payload);
    const plainHeaders = buildPlainBeamerUpdateHeaders(headers);
    const outbound = buildIsvsOutbound(productKeys, plainHeaders, data, { link: false });
    const audit = auditIsvsOutboundEncryption(productKeys, outbound);
    audit.isvsUrl = ISVS_BEAMER_UPDATE_URL;

    if (process.env.BEAMER_ISVS_DEBUG === "true") {
      logBeamerIsvsOutbound("outbound (update)", audit);
    }

    const { axiosHeaders, isvsBody } = stripIsvsOutboundDebug(outbound);

    try {
      const response = await axios.post(ISVS_BEAMER_UPDATE_URL, isvsBody, {
        headers: axiosHeaders,
        validateStatus: () => true,
      });
      const result = isvsAxiosResult(response, productKeys, axiosHeaders);

      if (result.body?.code === 5000) {
        logBeamerIsvsOutbound("ISVS decryption failed (update)", audit, {
          isvsCode: result.body.code,
          isvsMessage: result.body.message,
          hint:
            audit.allSelfDecryptOk
              ? "Console round-trip decrypt succeeded — ISVS likely expects a different wire format or key material."
              : "Console round-trip decrypt failed — fix local encryption before retrying ISVS.",
        });
      }

      return result;
    } catch (error) {
      if (error instanceof ErrorClass) throw error;
      return isvsResultFromAxiosError(error, productKeys, axiosHeaders);
    }
  }
}
