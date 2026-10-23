#!/usr/bin/env node
/**
 * Probe Alpha Login/Client/Basic (no secrets logged).
 * Usage: node scripts/alpha-login-probe.mjs [email] [password]
 */
import dotenv from "dotenv";
dotenv.config();

const { alphaClientBasicLogin } = await import("../src/services/alphaAccountAuth.js");
const { AlphaPassthroughError } = await import("../src/utils/errorClass/index.js");

const email = process.argv[2] || "probe@example.com";
const password = process.argv[3] || "not-a-real-password";

try {
  const result = await alphaClientBasicLogin({
    email,
    password,
    clientContext: {
      ipAddress: "203.0.113.10",
      deviceId: "probe-device-id-0000000000000001",
      userAgent: "alpha-login-probe",
    },
  });
  console.log(
    JSON.stringify(
      { ok: true, phase: result.phase, httpStatus: result.httpStatus },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof AlphaPassthroughError) {
    console.log(JSON.stringify({ ok: false, http: error.statusCode, alpha: error.alphaBody }, null, 2));
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      { ok: false, status: error.statusCode, message: error.message },
      null,
      2,
    ),
  );
  process.exit(1);
}
