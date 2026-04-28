#!/usr/bin/env node
/**
 * Decrypt production-style env secrets (same rules as src/config/env.js).
 *
 * Easiest: paste the ciphertext only — if that exact value exists in .env under
 * any production DB ciphertext var, the script picks the matching keychain pair.
 *   npm run decrypt -- "<ciphertext>"
 *
 * Or pass keychain as 2nd arg / use --from-env when ciphertext is not in .env.
 */

import dotenv from "dotenv";
import { decryptFromPlainPair, looksLikeBase64, stripWrappingQuotes } from "../src/utils/decryptProdSecret.js";

const KEYCHAIN_ENV = "DECRYPT_KEYCHAIN";

/** Mirrors src/config/env.js — order matches firstDefinedEnv resolution. */
const PRODUCTION_SECRET_SLOTS = [
  {
    label: "DB_NAME",
    encryptedVarNames: [
      "INF_STERLLO_CONSOLE_DATABASE_NAME_KEYCHAIN",
      "INF_STERLLO_CONSOLE_DATABASE_NAME_KEY",
    ],
    keychainVarNames: ["DB_NAME_KEY", "DB_NAME_KEYCHAIN"],
  },
  {
    label: "DB_USER",
    encryptedVarNames: [
      "INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEYCHAIN",
      "INF_STERLLO_CONSOLE_DATABASE_USERNAME_KEY",
    ],
    keychainVarNames: ["DB_USERNAME_KEY", "DB_USERNAME_KEYCHAIN"],
  },
  {
    label: "DB_PASSWORD",
    encryptedVarNames: [
      "INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEYCHAIN",
      "INF_STERLLO_CONSOLE_DATABASE_PASSWORD_KEY",
    ],
    keychainVarNames: ["DB_PASSWORD_KEY", "DB_PASSWORD_KEYCHAIN"],
  },
  {
    label: "DB_HOST",
    encryptedVarNames: [
      "INF_STERLLO_CONSOLE_DATABASE_HOST_KEYCHAIN",
      "INF_STERLLO_CONSOLE_DATABASE_HOST_KEY",
    ],
    keychainVarNames: ["DB_HOST_KEY", "DB_HOST_KEYCHAIN"],
  },
];

const KEYCHAIN_FALLBACK_ENVS = [
  "DB_NAME_KEYCHAIN",
  "DB_NAME_KEY",
  "DB_USERNAME_KEYCHAIN",
  "DB_USERNAME_KEY",
  "DB_PASSWORD_KEYCHAIN",
  "DB_PASSWORD_KEY",
  "DB_HOST_KEYCHAIN",
  "DB_HOST_KEY",
];

function firstDefinedEnv(names) {
  for (const name of names) {
    if (process.env[name] !== undefined && process.env[name] !== "") {
      return { value: process.env[name], name };
    }
  }
  return { value: undefined, name: names[0] };
}

function normSecret(s) {
  return stripWrappingQuotes(String(s || "").trim());
}

/** All .env names for a slot (ciphertext may live under INF_* or DB_* depending on deploy). */
function allSlotVarNames(slot) {
  return [...new Set([...slot.encryptedVarNames, ...slot.keychainVarNames])];
}

function findSlotMatch(inputNorm) {
  for (const slot of PRODUCTION_SECRET_SLOTS) {
    for (const name of allSlotVarNames(slot)) {
      const v = process.env[name];
      if (v && normSecret(v) === inputNorm) return { slot, matchedName: name };
    }
  }
  return null;
}

/**
 * The other half of the secret for this slot (keychain vs ciphertext can live under
 * INF_* or DB_* depending on deploy — same pairs as src/config/env.js).
 * Prefers DB_* keychain vars first, then INF_*.
 */
function pairedOtherSecret(slot, ciphertextNorm) {
  const ordered = [...new Set([...slot.keychainVarNames, ...slot.encryptedVarNames])];
  for (const name of ordered) {
    const v = process.env[name];
    if (!v || !String(v).trim()) continue;
    if (normSecret(v) === ciphertextNorm) continue;
    return { value: v, name };
  }
  return null;
}

function pickKeychainFromEnv() {
  const direct = process.env[KEYCHAIN_ENV];
  if (direct && String(direct).trim()) return { value: direct.trim(), source: KEYCHAIN_ENV };

  for (const name of KEYCHAIN_FALLBACK_ENVS) {
    const v = process.env[name];
    if (v && String(v).trim()) return { value: v.trim(), source: name };
  }
  return null;
}

function resolveSingleCiphertext(encryptedArg) {
  const inputNorm = normSecret(encryptedArg);
  const hit = findSlotMatch(inputNorm);
  if (hit) {
    const { slot, matchedName } = hit;
    const inEnc = slot.encryptedVarNames.includes(matchedName);
    const inKc = slot.keychainVarNames.includes(matchedName);

    let encrypted;
    let keychain;
    let keySource;

    if (inEnc) {
      encrypted = process.env[matchedName];
      const paired = pairedOtherSecret(slot, inputNorm);
      if (!paired) {
        console.error(
          `Matched ${slot.label} in .env (${matchedName}), but no second value in this slot.\n` +
            `Set one of: ${allSlotVarNames(slot).join(", ")} (must differ from the ciphertext).`,
        );
        process.exit(1);
      }
      keychain = paired.value;
      keySource = paired.name;
    } else if (inKc && looksLikeBase64(encryptedArg)) {
      encrypted = encryptedArg;
      const paired = pairedOtherSecret(slot, inputNorm);
      if (!paired) {
        console.error(
          `Matched ${slot.label} in ${matchedName} (ciphertext on a DB_*_KEY side). ` +
            `Set the paired keychain/ciphertext in another var for this slot:\n` +
            `  ${allSlotVarNames(slot).join("\n  ")}`,
        );
        process.exit(1);
      }
      keychain = paired.value;
      keySource = paired.name;
    } else if (inKc) {
      const enc = firstDefinedEnv(slot.encryptedVarNames);
      if (!enc.value) {
        console.error(`Matched keychain-shaped value in ${matchedName} but no ciphertext vars set for ${slot.label}.`);
        process.exit(1);
      }
      encrypted = enc.value;
      keychain = process.env[matchedName];
      keySource = matchedName;
    }

    return {
      encrypted,
      keychain,
      note: `(matched ${slot.label} in .env → decrypt using keychain from ${keySource})`,
    };
  }

  const picked = pickKeychainFromEnv();
  if (!picked) {
    console.error(
      `Could not match ciphertext to any of: ${PRODUCTION_SECRET_SLOTS.flatMap((s) => s.encryptedVarNames).join(", ")}.\n` +
        `Put the same ciphertext string in one of those .env vars (or use two args / --from-env).\n` +
        `Alternatively set ${KEYCHAIN_ENV}=... or any of: ${KEYCHAIN_FALLBACK_ENVS.join(", ")}.`,
    );
    process.exit(1);
  }
  return {
    encrypted: encryptedArg,
    keychain: picked.value,
    note:
      picked.source === KEYCHAIN_ENV
        ? `(using ${KEYCHAIN_ENV})`
        : `(using keychain from ${picked.source} — paste ciphertext also into a matching INF_* / DB_* ciphertext var to avoid wrong pairing)`,
  };
}

function printUsage() {
  console.error(`Usage:
  npm run decrypt -- "<ciphertext>"
  (Put that exact ciphertext in .env under the right INF_* / DB_* var; script picks the keychain for that slot.)

  npm run decrypt -- "<ciphertext>" "<keychain>"
  npm run decrypt -- --from-env <CIPHERTEXT_ENV> <KEYCHAIN_ENV>
  npm run decrypt -- --encrypted "<ciphertext>" --keychain "<keychain>"
`);
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    printUsage();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  dotenv.config();

  let encrypted;
  let keychain;
  let note;

  if (argv[0] === "--from-env") {
    const encVar = argv[1];
    const kcVar = argv[2];
    if (!encVar || !kcVar) {
      printUsage();
      process.exit(1);
    }
    encrypted = process.env[encVar];
    keychain = process.env[kcVar];
    if (encrypted === undefined || encrypted === "") {
      console.error(`Missing or empty env: ${encVar}`);
      process.exit(1);
    }
    if (keychain === undefined || keychain === "") {
      console.error(`Missing or empty env: ${kcVar}`);
      process.exit(1);
    }
  } else {
    const encIdx = argv.indexOf("--encrypted");
    const kcIdx = argv.indexOf("--keychain");
    if (encIdx !== -1 && kcIdx !== -1 && argv[encIdx + 1] && argv[kcIdx + 1]) {
      encrypted = argv[encIdx + 1];
      keychain = argv[kcIdx + 1];
    } else if ((argv[0] === "-e" || argv[0] === "--encrypted") && argv[1]) {
      const r = resolveSingleCiphertext(argv[1]);
      encrypted = r.encrypted;
      keychain = r.keychain;
      note = r.note;
    } else if (argv.length >= 2) {
      encrypted = argv[0];
      keychain = argv[1];
    } else if (argv.length === 1) {
      const r = resolveSingleCiphertext(argv[0]);
      encrypted = r.encrypted;
      keychain = r.keychain;
      note = r.note;
    } else {
      printUsage();
      process.exit(1);
    }
  }

  if (note) console.error(note);

  try {
    const plain = decryptFromPlainPair(encrypted, keychain, { valueName: "value" });
    process.stdout.write(`${plain}\n`);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

main();
