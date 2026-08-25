/**
 * Sterllo wallet API Credentials (same pattern as merchant SDK):
 * createApiCredentials(userKey, accountKey, sessionId) → encodeCredentials(...)
 */

export function createApiCredentials(userKey, accountKey, sessionId) {
  return {
    key: String(userKey || "").trim(),
    account_key: String(accountKey || "").trim(),
    session_id: String(sessionId || "").trim(),
  };
}

/** Base64-encode credentials JSON (same style as encodeToBase64 for query payloads). */
export function encodeCredentials(credentials) {
  return Buffer.from(JSON.stringify(credentials), "utf8").toString("base64");
}

export function encodeToBase64(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function buildSterlloCredentialsHeader(userKey, accountKey, sessionId) {
  return encodeCredentials(createApiCredentials(userKey, accountKey, sessionId));
}
