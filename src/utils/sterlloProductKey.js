import { stripWrappingQuotes } from "./decryptProdSecret.js";

/**
 * Sterllo decrypted product keys are pipe-delimited, often:
 * `<PRODUCT_TAG>identifier|...|...`
 * Alpha Login expects `Source-Product-Id` separate from the full key string.
 */
export function extractSourceProductIdFromKey(decryptedProductKey) {
  const key = stripWrappingQuotes(String(decryptedProductKey ?? "").trim());
  if (!key) return "";

  const parts = key.split("|").map((part) => part.trim()).filter(Boolean);
  const head = parts[0] || key;

  const afterTag = head.match(/^<[^>]+>(.+)$/)?.[1]?.trim() || "";
  const tagName = head.match(/^<([^>]+)>/)?.[1]?.trim() || "";

  for (let i = 1; i < parts.length; i += 1) {
    const candidate = parts[i];
    if (!candidate || candidate.includes("<")) continue;
    if (candidate.length >= 8 && candidate.length <= 128) {
      return candidate;
    }
  }

  if (afterTag.length >= 8 && afterTag.length <= 128) {
    return afterTag;
  }

  if (tagName) {
    return tagName;
  }

  if (afterTag) {
    return afterTag;
  }

  if (parts.length > 1) {
    return parts[parts.length - 1];
  }

  return head;
}

export function isSterlloSourceProductKeyConfigured() {
  const enc = stripWrappingQuotes(process.env.SOURCE_PRODUCT_KEY || "");
  const kc = stripWrappingQuotes(
    process.env.SOURCE_PRODUCT_KEY_KEYCHAIN ||
      process.env.SOURCE_PRODUCT_KEY_KEYCHAIN ||
      "",
  );
  return Boolean(enc && kc);
}
