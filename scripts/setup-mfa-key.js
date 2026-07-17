#!/usr/bin/env node
import crypto from "crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
const keyPattern = /^MFA_ENCRYPTION_KEY\s*=(.*)$/m;

let contents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = contents.match(keyPattern);
const existingValue = existing?.[1]?.trim().replace(/^(['"])(.*)\1$/, "$2");

if (existingValue) {
  console.log("MFA_ENCRYPTION_KEY is already configured; no changes made.");
  process.exit(0);
}

const generatedKey = crypto.randomBytes(32).toString("base64");

if (existing) {
  contents = contents.replace(keyPattern, `MFA_ENCRYPTION_KEY=${generatedKey}`);
} else {
  const separator = contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  contents = `${contents}${separator}MFA_ENCRYPTION_KEY=${generatedKey}\n`;
}

writeFileSync(envPath, contents, { encoding: "utf8", mode: 0o600 });
chmodSync(envPath, 0o600);
console.log("Generated and saved MFA_ENCRYPTION_KEY in .env.");
