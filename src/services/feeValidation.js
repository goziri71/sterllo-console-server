import { ErrorClass } from "../utils/errorClass/index.js";

export const FEE_TYPES = Object.freeze([
  "deposit",
  "payout",
  "swap",
  "transfer",
  "withdrawal",
  "overdraft_processing",
  "wallet_maintenance",
]);

const TYPE_FIELDS = Object.freeze({
  deposit: {
    keys: ["method", "currency_code"],
    values: ["charge_value", "charge_percentage", "charge_cap", "vat_include"],
  },
  payout: {
    keys: ["method", "currency_code"],
    values: ["charge_value", "charge_percentage", "charge_cap", "vat_include"],
  },
  swap: {
    keys: ["currency_code"],
    values: ["charge_value", "charge_percentage", "charge_cap", "vat_include"],
  },
  transfer: {
    keys: ["currency_code"],
    values: [
      "sender_charge_value",
      "sender_charge_percentage",
      "sender_charge_cap",
      "sender_vat_include",
      "recipient_charge_value",
      "recipient_charge_percentage",
      "recipient_charge_cap",
      "recipient_vat_include",
    ],
  },
  withdrawal: {
    keys: ["currency_code"],
    values: [
      "charge_value",
      "charge_percentage",
      "charge_cap",
      "vat_include",
      "payer_type",
      "payer_percentage",
    ],
  },
  overdraft_processing: {
    keys: ["currency_code"],
    values: ["fee", "cap", "vat_include"],
  },
  wallet_maintenance: {
    keys: ["currency_code"],
    values: ["fee", "cap"],
  },
});

const DECIMAL_FIELDS = new Set([
  "charge_value",
  "charge_percentage",
  "charge_cap",
  "sender_charge_value",
  "sender_charge_percentage",
  "sender_charge_cap",
  "recipient_charge_value",
  "recipient_charge_percentage",
  "recipient_charge_cap",
  "fee",
  "cap",
]);

const PERCENTAGE_FIELDS = new Set([
  "charge_percentage",
  "sender_charge_percentage",
  "recipient_charge_percentage",
]);

const FLAG_FIELDS = new Set([
  "vat_include",
  "sender_vat_include",
  "recipient_vat_include",
  "is_enabled",
]);

const DECIMAL_RE = /^\d+(?:\.\d{1,8})?$/;
const CURRENCY_RE = /^[A-Z0-9]{3,5}$/;
const PAYER_TYPES = new Set(["CUSTOMER", "MERCHANT", "SHARED"]);

export function feeTypeDefinition(feeType) {
  const normalized = String(feeType || "").trim().toLowerCase();
  const definition = TYPE_FIELDS[normalized];
  if (!definition) {
    throw new ErrorClass(`Unsupported fee type: ${feeType}`, 400);
  }
  return { feeType: normalized, ...definition };
}

export function feeNaturalKey(feeType, row) {
  const { keys } = feeTypeDefinition(feeType);
  return keys
    .map((field) => String(row?.[field] ?? "").trim().toLowerCase())
    .join("::");
}

export function mergeFeeSchedules(feeType, defaults = [], custom = []) {
  const enabledCustom = new Map(
    custom
      .filter((row) => String(row.is_enabled || "N").toUpperCase() === "Y")
      .map((row) => [feeNaturalKey(feeType, row), row]),
  );

  const effective = defaults.map((defaultRow) => {
    const customRow = enabledCustom.get(feeNaturalKey(feeType, defaultRow));
    if (!customRow) {
      return {
        ...defaultRow,
        source: "default",
        default_id: defaultRow.id,
        custom_id: null,
      };
    }
    enabledCustom.delete(feeNaturalKey(feeType, defaultRow));
    return {
      ...customRow,
      source: "custom",
      default_id: defaultRow.id,
      custom_id: customRow.id,
    };
  });

  return effective;
}

function normalizeDecimal(field, value) {
  const normalized = String(value).trim();
  if (!DECIMAL_RE.test(normalized)) {
    throw new ErrorClass(`${field} must be a non-negative decimal with at most 8 decimal places`, 400);
  }
  if (PERCENTAGE_FIELDS.has(field) && Number(normalized) > 100) {
    throw new ErrorClass(`${field} must be between 0 and 100`, 400);
  }
  return normalized;
}

function normalizeField(field, value) {
  if (field === "currency_code") {
    const currency = String(value || "").trim().toUpperCase();
    if (!CURRENCY_RE.test(currency)) {
      throw new ErrorClass("currency_code must contain 3 to 5 letters or digits", 400);
    }
    return currency;
  }
  if (field === "method") {
    const method = String(value || "").trim();
    if (!method || method.length > 50) {
      throw new ErrorClass("method must contain 1 to 50 characters", 400);
    }
    return method;
  }
  if (DECIMAL_FIELDS.has(field)) {
    return normalizeDecimal(field, value);
  }
  if (FLAG_FIELDS.has(field)) {
    const flag = String(value || "").trim().toUpperCase();
    if (flag !== "Y" && flag !== "N") {
      throw new ErrorClass(`${field} must be Y or N`, 400);
    }
    return flag;
  }
  if (field === "payer_type") {
    const payerType = String(value || "").trim().toUpperCase();
    if (!PAYER_TYPES.has(payerType)) {
      throw new ErrorClass("payer_type must be CUSTOMER, MERCHANT, or SHARED", 400);
    }
    return payerType;
  }
  if (field === "payer_percentage") {
    const percentage = Number(value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new ErrorClass("payer_percentage must be between 0 and 100", 400);
    }
    return percentage;
  }
  return value;
}

export function validateFeePayload(
  feeType,
  payload,
  { scope = "custom", partial = false } = {},
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ErrorClass("Request body is required", 400);
  }

  const { keys, values } = feeTypeDefinition(feeType);
  const allowed = new Set([...keys, ...values, ...(scope === "custom" ? ["is_enabled"] : [])]);
  const supplied = Object.keys(payload);
  const unknown = supplied.filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new ErrorClass(`Unknown pricing fields: ${unknown.join(", ")}`, 400);
  }
  if (supplied.length === 0) {
    throw new ErrorClass("At least one pricing field is required", 400);
  }

  if (partial) {
    const immutable = supplied.filter((field) => keys.includes(field));
    if (immutable.length > 0) {
      throw new ErrorClass(
        `Pricing matching fields cannot be changed: ${immutable.join(", ")}`,
        400,
      );
    }
  } else {
    const required = [...keys, ...values];
    const missing = required.filter(
      (field) => payload[field] === undefined || payload[field] === null || payload[field] === "",
    );
    if (missing.length > 0) {
      throw new ErrorClass(`Missing required pricing fields: ${missing.join(", ")}`, 400);
    }
  }

  return Object.fromEntries(
    supplied.map((field) => [field, normalizeField(field, payload[field])]),
  );
}
