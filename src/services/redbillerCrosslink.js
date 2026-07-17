import axios from "axios";

const CROSSLINK_VALIDATE_URL =
  "https://api.proxy.account.redbiller.com/api/v1/auth/login/crosslink/validate";

const VALIDATE_TIMEOUT_MS = 5000;

function upstreamMessage(body) {
  if (body == null) return "Redbiller validation failed";
  if (typeof body === "string" && body.trim()) return body.trim();
  if (typeof body === "object") {
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message.trim();
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
  }
  return "Redbiller validation failed";
}

/**
 * Validate a one-time crosslink token with Redbiller.
 * Never throws — returns a normalized result object for the auth layer to interpret.
 */
export async function validateCrosslinkToken(token) {
  try {
    const response = await axios.post(
      CROSSLINK_VALIDATE_URL,
      { token },
      {
        headers: { "Content-Type": "application/json" },
        timeout: VALIDATE_TIMEOUT_MS,
        validateStatus: () => true,
      },
    );

    if (response.status >= 400) {
      return {
        success: false,
        status: response.status,
        message: upstreamMessage(response.data),
        data: response.data,
      };
    }

    const data = response.data;
    if (data && data.success === false) {
      return {
        success: false,
        status: response.status,
        message: upstreamMessage(data),
        data,
      };
    }

    return { success: true, status: response.status, data };
  } catch (error) {
    return {
      success: false,
      status: 500,
      message: error.message || "Redbiller validation failed",
      data: null,
    };
  }
}

/** Extract local-user identifiers from a successful Redbiller crosslink payload. */
export function extractCrosslinkIdentifiers(data) {
  const root = (data && data.data) || {};
  const profile = root.profile || {};

  const billerId =
    profile.redbiller_id || root.redbiller_id || root.billerId || null;
  const email =
    profile.email ||
    profile.email_address ||
    root.email ||
    root.email_address ||
    null;

  return {
    billerId: billerId ? String(billerId).trim() : null,
    email: email ? String(email).trim() : null,
    sessionID: root.sessionID ?? root.session_id ?? null,
    userKey: root.userKey ?? root.user_key ?? null,
  };
}
