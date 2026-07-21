import test from "node:test";
import assert from "node:assert/strict";
import {
  feeNaturalKey,
  mergeFeeSchedules,
  validateFeePayload,
} from "../src/services/feeValidation.js";

test("merchant pricing overrides matching defaults and falls back for missing rows", () => {
  const defaults = [
    { id: 1, method: "card", currency_code: "NGN", charge_value: "100" },
    { id: 2, method: "bank", currency_code: "NGN", charge_value: "50" },
  ];
  const custom = [
    {
      id: 10,
      method: "CARD",
      currency_code: "ngn",
      charge_value: "80",
      is_enabled: "Y",
    },
  ];

  const effective = mergeFeeSchedules("deposit", defaults, custom);
  assert.equal(effective.length, 2);
  assert.equal(effective[0].source, "custom");
  assert.equal(effective[0].charge_value, "80");
  assert.equal(effective[0].default_id, 1);
  assert.equal(effective[0].custom_id, 10);
  assert.equal(effective[1].source, "default");
  assert.equal(effective[1].custom_id, null);
});

test("disabled merchant pricing falls back to the matching default", () => {
  const defaults = [{ id: 1, currency_code: "USD", fee: "2.00", cap: "10.00" }];
  const custom = [
    { id: 10, currency_code: "USD", fee: "1.00", cap: "5.00", is_enabled: "N" },
  ];

  const [effective] = mergeFeeSchedules("wallet_maintenance", defaults, custom);
  assert.equal(effective.source, "default");
  assert.equal(effective.fee, "2.00");
});

test("natural pricing keys include method only where required", () => {
  assert.equal(
    feeNaturalKey("deposit", { method: " Card ", currency_code: "NGN" }),
    "card::ngn",
  );
  assert.equal(feeNaturalKey("swap", { currency_code: "USD" }), "usd");
});

test("pricing validation normalizes values and rejects invalid percentages", () => {
  const values = validateFeePayload("deposit", {
    method: "card",
    currency_code: "ngn",
    charge_value: "100.00",
    charge_percentage: "1.5",
    charge_cap: "500.00",
    vat_include: "y",
    is_enabled: "n",
  });
  assert.equal(values.currency_code, "NGN");
  assert.equal(values.vat_include, "Y");
  assert.equal(values.is_enabled, "N");

  assert.throws(
    () =>
      validateFeePayload("deposit", {
        method: "card",
        currency_code: "NGN",
        charge_value: "100",
        charge_percentage: "101",
        charge_cap: "500",
        vat_include: "N",
      }),
    /between 0 and 100/,
  );
});

test("pricing matching fields cannot be changed by patch", () => {
  assert.throws(
    () =>
      validateFeePayload(
        "swap",
        { currency_code: "USD" },
        { scope: "custom", partial: true },
      ),
    /cannot be changed/,
  );
});
