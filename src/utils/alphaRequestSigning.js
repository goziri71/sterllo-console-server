import crypto from "crypto";
import { encryptIsvsJson } from "./isvsCryptoJs.js";

/**
 * Sterllo / Alpha client-login wire (aligned with makeEncryptedApiCall + mobile trace).
 * Device-Signature lives inside encrypted Credentials; X-Request-Signature is a separate header.
 */
export function buildAlphaDeviceSignature(deviceId, requestId, encryptionKey) {
  const material = `${String(deviceId || "").trim()}:${String(requestId || "").trim()}`;
  return crypto.createHmac("sha256", encryptionKey).update(material).digest("base64");
}

export function buildAlphaRequestSignature({
  requestId,
  encryptedPayload,
  deviceId,
  encryptionKey,
  iv,
}) {
  return encryptIsvsJson(
    {
      request_id: requestId,
      payload: encryptedPayload,
      device: { id: String(deviceId || "").trim() },
    },
    encryptionKey,
    iv,
  );
}
