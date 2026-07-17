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
  assert.equal(identifiers.email, "User@Example.com");
  assert.equal(identifiers.sessionID, "session-1");
  assert.equal(identifiers.userKey, "user-key-1");
});
