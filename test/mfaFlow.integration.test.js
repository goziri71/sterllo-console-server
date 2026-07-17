import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const runDatabaseTests = process.env.RUN_MFA_DB_TESTS === "1";

test(
  "forced enrollment, recovery, and single-device replacement",
  { skip: !runDatabaseTests, timeout: 60_000 },
  async () => {
    process.env.MFA_ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("base64");

    const [{ generate }, { eq }, { default: app }, jwt, authModule, securityModule, dbModule, userSchema, securitySchema] =
      await Promise.all([
        import("otplib"),
        import("drizzle-orm"),
        import("../app.js"),
        import("../src/utils/jwt/index.js"),
        import("../src/services/auth.js"),
        import("../src/services/mfaSecurity.js"),
        import("../src/db/index.js"),
        import("../src/db/schema/users.js"),
        import("../src/db/schema/authSecurity.js"),
      ]);

    const { authDb, authPool, pool } = dbModule;
    const { users } = userSchema;
    const {
      authLoginChallenges,
      authMfaFactors,
      authMfaRecoveryCodes,
      authSecurityEvents,
      authSessions,
    } = securitySchema;
    const email = `mfa-integration-${Date.now()}@example.invalid`;
    const metadata = {
      ipAddress: "127.0.0.1",
      userAgent: "mfa-integration-test",
      deviceLabel: "First Device",
    };
    let userId;

    try {
      await app.ready();
      jwt.setApp(app);
      const auth = new authModule.default();
      const security = new securityModule.default();

      const enrollment = await auth.register({
        email,
        password: "Test-password-123!",
        first_name: "MFA",
        last_name: "Integration",
        metadata,
      });
      assert.equal(enrollment.state, "mfa_enrollment_required");

      const code = await generate({ secret: enrollment.factor.secret });
      const first = await auth.confirmMfaEnrollment({
        challengeToken: enrollment.challenge_token,
        code,
        metadata,
      });
      userId = first.user.id;
      assert.ok(first.token);
      assert.equal(first.recovery_codes.length > 0, true);

      const loginChallenge = await auth.login({
        email,
        password: "Test-password-123!",
        metadata: { ...metadata, deviceLabel: "Replacement Device" },
      });
      const second = await auth.completeMfaLogin({
        challengeToken: loginChallenge.challenge_token,
        recoveryCode: first.recovery_codes[0],
        metadata: { ...metadata, deviceLabel: "Replacement Device" },
      });

      assert.equal(
        await security.getActiveSession(first.session.id, userId),
        null,
      );
      assert.ok(await security.getActiveSession(second.session.id, userId));

      const replayChallenge = await auth.login({
        email,
        password: "Test-password-123!",
        metadata,
      });
      await assert.rejects(
        auth.completeMfaLogin({
          challengeToken: replayChallenge.challenge_token,
          recoveryCode: first.recovery_codes[0],
          metadata,
        }),
        /Invalid recovery code/,
      );
    } finally {
      if (userId) {
        await authDb
          .delete(authSecurityEvents)
          .where(eq(authSecurityEvents.user_id, userId));
        await authDb.delete(authSessions).where(eq(authSessions.user_id, userId));
        await authDb
          .delete(authLoginChallenges)
          .where(eq(authLoginChallenges.user_id, userId));
        await authDb
          .delete(authMfaRecoveryCodes)
          .where(eq(authMfaRecoveryCodes.user_id, userId));
        await authDb
          .delete(authMfaFactors)
          .where(eq(authMfaFactors.user_id, userId));
        await authDb.delete(users).where(eq(users.id, userId));
      }
      await app.close();
      await Promise.all([authPool.end(), pool.end()]);
    }
  },
);
