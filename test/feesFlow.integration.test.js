import test from "node:test";
import assert from "node:assert/strict";

const runDatabaseTests = process.env.RUN_PRICING_DB_TESTS === "1";

test(
  "default and merchant pricing mutations produce effective fallback and audit events",
  { skip: !runDatabaseTests, timeout: 60_000 },
  async () => {
    const [{ eq }, { authDb, db, pool, authPool }, { default: FeeService }, schemas] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.js"),
      import("../src/services/fees.js"),
      import("../src/db/schema/index.js"),
    ]);
    const {
      merchants,
      defaultBaaSDepositFees,
      customBaaSDepositFees,
      pricingFeeAuditEvents,
    } = schemas;

    const suffix = String(Date.now()).slice(-10);
    const accountKey = `price-${suffix}`;
    const merchantUserKey = `user-${suffix}`;
    const method = `integration-${suffix}`;
    const context = {
      actorUserId: 1,
      actorUserKey: "pricing-integration-actor",
      actorSessionId: "00000000-0000-4000-8000-000000000001",
      ipAddress: "127.0.0.1",
      userAgent: "pricing-integration-test",
    };
    const fees = new FeeService();
    let defaultRow;
    let customRow;

    try {
      await db.insert(merchants).values({
        user_key: merchantUserKey,
        account_key: accountKey,
        name: "Pricing Integration Merchant",
        date_created: new Date(),
      });

      defaultRow = await fees.createDefaultFee(
        "deposit",
        {
          method,
          currency_code: "TST",
          charge_value: "100.00",
          charge_percentage: "1.00",
          charge_cap: "500.00",
          vat_include: "N",
        },
        context,
      );
      customRow = await fees.createMerchantFee(
        accountKey,
        "deposit",
        {
          method,
          currency_code: "TST",
          charge_value: "80.00",
          charge_percentage: "0.50",
          charge_cap: "400.00",
          vat_include: "Y",
          is_enabled: "Y",
        },
        context,
      );

      let result = await fees.getMerchantFeesWithDefaults(accountKey);
      const effectiveCustom = result.effective.deposit.find(
        (row) => row.default_id === defaultRow.id,
      );
      assert.equal(effectiveCustom.source, "custom");
      assert.equal(effectiveCustom.charge_value, "80.00");

      await fees.updateMerchantFee(
        accountKey,
        "deposit",
        customRow.id,
        { is_enabled: "N" },
        context,
      );
      result = await fees.getMerchantFeesWithDefaults(accountKey);
      const effectiveDefault = result.effective.deposit.find(
        (row) => row.default_id === defaultRow.id,
      );
      assert.equal(effectiveDefault.source, "default");

      const auditRows = await fees.listPricingAudit({ accountKey });
      assert.equal(auditRows.length >= 2, true);
    } finally {
      await authDb
        .delete(pricingFeeAuditEvents)
        .where(eq(pricingFeeAuditEvents.account_key, accountKey));
      await db
        .delete(customBaaSDepositFees)
        .where(eq(customBaaSDepositFees.account_key, accountKey));
      if (defaultRow?.id) {
        await db
          .delete(defaultBaaSDepositFees)
          .where(eq(defaultBaaSDepositFees.id, defaultRow.id));
      }
      await db.delete(merchants).where(eq(merchants.account_key, accountKey));
      await Promise.all([pool.end(), authPool.end()]);
    }
  },
);
