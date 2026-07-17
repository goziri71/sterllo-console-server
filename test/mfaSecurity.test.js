import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generate, generateSecret } from "otplib";
import { env } from "../src/config/env.js";
import {
  challengeIsUsable,
  createRecoveryCodes,
  decryptMfaSecret,
  encryptMfaSecret,
  hashOpaqueToken,
  normalizeRecoveryCode,
  verifyTotpCode,
} from "../src/services/mfaSecurity.js";

env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
env.MFA_TOTP_TOLERANCE_SECONDS = 30;

test("MFA secrets are encrypted with authenticated encryption", () => {
  const secret = generateSecret();
  const encrypted = encryptMfaSecret(secret);

  assert.notEqual(encrypted.ciphertext, secret);
  assert.equal(
    decryptMfaSecret({
      secret_ciphertext: encrypted.ciphertext,
      secret_iv: encrypted.iv,
      secret_tag: encrypted.tag,
    }),
    secret,
  );

  assert.throws(() =>
    decryptMfaSecret({
      secret_ciphertext: encrypted.ciphertext,
      secret_iv: encrypted.iv,
      secret_tag: `${encrypted.tag.slice(0, -2)}00`,
    }),
  );
});

test("TOTP verification rejects replayed time steps", async () => {
  const secret = generateSecret();
  const encrypted = encryptMfaSecret(secret);
  const factor = {
    secret_ciphertext: encrypted.ciphertext,
    secret_iv: encrypted.iv,
    secret_tag: encrypted.tag,
    last_used_step: null,
  };
  const token = await generate({ secret });

  const first = await verifyTotpCode(factor, token);
  assert.equal(first.valid, true);
  assert.equal(typeof first.timeStep, "number");

  const replay = await verifyTotpCode(
    { ...factor, last_used_step: first.timeStep },
    token,
  );
  assert.equal(replay.valid, false);
});

test("challenge policy enforces purpose, expiry, attempts, and one-time use", () => {
  const at = new Date("2026-01-01T00:00:00Z");
  const challenge = {
    purpose: "mfa_login",
    attempts: 0,
    max_attempts: 5,
    expires_at: new Date("2026-01-01T00:05:00Z"),
    consumed_at: null,
  };

  assert.equal(challengeIsUsable(challenge, "mfa_login", at), true);
  assert.equal(challengeIsUsable(challenge, "mfa_enroll", at), false);
  assert.equal(
    challengeIsUsable(
      { ...challenge, attempts: 5 },
      "mfa_login",
      at,
    ),
    false,
  );
  assert.equal(
    challengeIsUsable(
      { ...challenge, consumed_at: at },
      "mfa_login",
      at,
    ),
    false,
  );
  assert.equal(
    challengeIsUsable(
      challenge,
      "mfa_login",
      new Date("2026-01-01T00:05:01Z"),
    ),
    false,
  );
});

test("recovery codes are high-entropy, normalized, and hashable", () => {
  const codes = createRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/);
    const normalized = normalizeRecoveryCode(code.toLowerCase());
    assert.equal(hashOpaqueToken(normalized).length, 64);
    assert.equal(normalized, code.replaceAll("-", ""));
  }
});
