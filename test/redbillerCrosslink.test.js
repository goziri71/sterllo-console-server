import test from "node:test";
import assert from "node:assert/strict";
import { extractCrosslinkIdentifiers } from "../src/services/redbillerCrosslink.js";

test("Crosslink identifiers keep email separate from biller id", () => {
  const identifiers = extractCrosslinkIdentifiers({
    data: {
      profile: {
        redbiller_id: "RB-123",
        email: "User@Example.com",
      },
      sessionID: "session-1",
      userKey: "user-key-1",
    },
  });

  assert.equal(identifiers.billerId, "RB-123");
  assert.equal(identifiers.email, "user@example.com");
  assert.equal(identifiers.sessionID, "session-1");
  assert.equal(identifiers.userKey, "user-key-1");
});

test("Crosslink identifiers support nested Redbiller account profile shape", () => {
  const identifiers = extractCrosslinkIdentifiers({
    code: 2000,
    state: true,
    data: {
      profile: {
        key: "rb-user-key",
        redbiller_id: "user@biller.red",
        bio: {
          mailer: {
            email_address: "Console.User@Example.com",
          },
        },
        contacts: {
          email_address: "console.user@example.com",
        },
      },
      session: {
        id: "redbiller-session-id",
      },
    },
  });

  assert.deepEqual(identifiers, {
    billerId: "user@biller.red",
    email: "console.user@example.com",
    sessionID: "redbiller-session-id",
    userKey: "rb-user-key",
  });
});
