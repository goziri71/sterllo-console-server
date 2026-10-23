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

  // Sterllo console keys: `<STERLLO_CONSOLE>…|public|…|<product_id>` — Alpha expects the trailing id.
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    if (last && !last.includes("<") && last.length >= 6 && last.length <= 32) {
      return last;
    }
  }

  // Alpha account keys: `<ALPHA>.<product_id>|…`
  if (afterTag.length >= 6 && afterTag.length <= 32) {
    return afterTag;
  }

  for (let i = 1; i < parts.length; i += 1) {
    const candidate = parts[i];
    if (!candidate || candidate.includes("<")) continue;
    if (candidate.length >= 6 && candidate.length <= 32) {
      return candidate;
    }
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
