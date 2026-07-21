import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { authDb, db } from "../db/index.js";
import { merchants } from "../db/schema/merchants.js";
import { pricingFeeAuditEvents } from "../db/schema/pricingAudit.js";
import {
  customBaaSDepositFees,
  customBaaSPayoutFees,
  customBaaSSwapFees,
  customBaaSTransferFees,
  customBaaSWithdrawalFees,
  customOverdraftProcessingFees,
  customWalletMaintenanceFees,
} from "../db/schema/customBaasFees.js";
import {
  customSaaSDepositFees,
  customSaaSPayoutFees,
  customSaaSSwapFees,
  customSaaSTransferFees,
  customSaaSWithdrawalFees,
} from "../db/schema/customSaasFees.js";
import {
  defaultBaaSDepositFees,
  defaultBaaSPayoutFees,
  defaultBaaSSwapFees,
  defaultBaaSTransferFees,
  defaultBaaSWithdrawalFees,
  defaultOverdraftProcessingFees,
  defaultWalletMaintenanceFees,
} from "../db/schema/defaultFees.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import {
  feeNaturalKey,
  feeTypeDefinition,
  mergeFeeSchedules,
  validateFeePayload,
} from "./feeValidation.js";

const DEFAULT_TABLES = Object.freeze({
  deposit: defaultBaaSDepositFees,
  payout: defaultBaaSPayoutFees,
  swap: defaultBaaSSwapFees,
  transfer: defaultBaaSTransferFees,
  withdrawal: defaultBaaSWithdrawalFees,
  overdraft_processing: defaultOverdraftProcessingFees,
  wallet_maintenance: defaultWalletMaintenanceFees,
});

const CUSTOM_TABLES = Object.freeze({
  deposit: customBaaSDepositFees,
  payout: customBaaSPayoutFees,
  swap: customBaaSSwapFees,
  transfer: customBaaSTransferFees,
  withdrawal: customBaaSWithdrawalFees,
  overdraft_processing: customOverdraftProcessingFees,
  wallet_maintenance: customWalletMaintenanceFees,
});

const FEE_TYPE_ENTRIES = Object.entries(DEFAULT_TABLES);

function feeTable(feeType, scope) {
  const { feeType: normalized } = feeTypeDefinition(feeType);
  return {
    feeType: normalized,
    table: scope === "default" ? DEFAULT_TABLES[normalized] : CUSTOM_TABLES[normalized],
  };
}

function naturalKeyWhere(feeType, table, row, accountKey) {
  const { keys } = feeTypeDefinition(feeType);
  const clauses = keys.map((field) => eq(table[field], row[field]));
  if (accountKey !== undefined) {
    clauses.unshift(eq(table.account_key, accountKey));
  }
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

function numericId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorClass("Pricing row id must be a positive integer", 400);
  }
  return id;
}

export default class FeeService {
  async _merchant(accountKey, executor = db) {
    const [merchant] = await executor
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);
    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }
    return merchant;
  }

  async getMerchantFees(accountKey) {
    await this._merchant(accountKey);
    const rows = await Promise.all(
      FEE_TYPE_ENTRIES.map(([feeType]) =>
        db
          .select()
          .from(CUSTOM_TABLES[feeType])
          .where(eq(CUSTOM_TABLES[feeType].account_key, accountKey)),
      ),
    );
    return Object.fromEntries(FEE_TYPE_ENTRIES.map(([feeType], index) => [feeType, rows[index]]));
  }

  async getCustomerFees(accountKey) {
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(eq(merchants.account_key, accountKey))
      .limit(1);

    if (!merchant) {
      throw new ErrorClass("Merchant not found", 404);
    }

    const [deposit, payout, swap, transfer, withdrawal] = await Promise.all([
      db.select().from(customSaaSDepositFees).where(eq(customSaaSDepositFees.account_key, accountKey)),
      db.select().from(customSaaSPayoutFees).where(eq(customSaaSPayoutFees.account_key, accountKey)),
      db.select().from(customSaaSSwapFees).where(eq(customSaaSSwapFees.account_key, accountKey)),
      db.select().from(customSaaSTransferFees).where(eq(customSaaSTransferFees.account_key, accountKey)),
      db.select().from(customSaaSWithdrawalFees).where(eq(customSaaSWithdrawalFees.account_key, accountKey)),
    ]);

    return {
      deposit,
      payout,
      swap,
      transfer,
      withdrawal,
    };
  }

  async getDefaultFees() {
    const rows = await Promise.all(FEE_TYPE_ENTRIES.map(([, table]) => db.select().from(table)));
    return Object.fromEntries(FEE_TYPE_ENTRIES.map(([feeType], index) => [feeType, rows[index]]));
  }

  async getMerchantFeesWithDefaults(accountKey) {
    const [customFees, defaults] = await Promise.all([
      this.getMerchantFees(accountKey),
      this.getDefaultFees(),
    ]);

    return {
      custom: customFees,
      defaults,
      effective: Object.fromEntries(
        FEE_TYPE_ENTRIES.map(([feeType]) => [
          feeType,
          mergeFeeSchedules(feeType, defaults[feeType], customFees[feeType]),
        ]),
      ),
    };
  }

  async _audit(
    action,
    scope,
    feeType,
    before,
    after,
    context,
    accountKey = null,
    merchantUserKey = null,
  ) {
    await authDb.insert(pricingFeeAuditEvents).values({
      actor_user_id: context.actorUserId,
      actor_user_key: context.actorUserKey,
      actor_session_id: context.actorSessionId,
      action,
      scope,
      fee_type: feeType,
      fee_row_id: after?.id ?? before?.id ?? null,
      merchant_user_key: merchantUserKey,
      account_key: accountKey,
      before_json: before ? JSON.stringify(before) : null,
      after_json: after ? JSON.stringify(after) : null,
      ip_address: context.ipAddress || null,
      user_agent: context.userAgent || null,
      date_created: new Date(),
    });
  }

  async _rowById(executor, table, rowId, accountKey, { forUpdate = false } = {}) {
    const clauses = [eq(table.id, numericId(rowId))];
    if (accountKey !== undefined) {
      clauses.push(eq(table.account_key, accountKey));
    }
    const query = executor
      .select()
      .from(table)
      .where(and(...clauses))
      .limit(1);
    const [row] = await (forUpdate ? query.for("update") : query);
    if (!row) {
      throw new ErrorClass("Pricing row not found", 404);
    }
    return row;
  }

  async createDefaultFee(feeType, payload, context) {
    const { feeType: normalized, table } = feeTable(feeType, "default");
    const values = validateFeePayload(normalized, payload, { scope: "default" });
    const [existing] = await db
      .select({ id: table.id })
      .from(table)
      .where(naturalKeyWhere(normalized, table, values))
      .limit(1);
    if (existing) {
      throw new ErrorClass("Default pricing already exists for this matching key", 409);
    }

    const created = await db.transaction(async (tx) => {
      const timestamp = new Date();
      const result = await tx.insert(table).values({
        ...values,
        identifier: crypto.randomUUID(),
        date_created: timestamp,
        date_modified: timestamp,
      });
      return this._rowById(tx, table, result[0].insertId);
    });
    await this._audit("create", "default", normalized, null, created, context);
    return created;
  }

  async updateDefaultFee(feeType, rowId, payload, context) {
    const { feeType: normalized, table } = feeTable(feeType, "default");
    const values = validateFeePayload(normalized, payload, {
      scope: "default",
      partial: true,
    });
    const { before, after } = await db.transaction(async (tx) => {
      const before = await this._rowById(tx, table, rowId, undefined, {
        forUpdate: true,
      });
      await tx
        .update(table)
        .set({ ...values, date_modified: new Date() })
        .where(eq(table.id, before.id));
      const after = await this._rowById(tx, table, before.id);
      return { before, after };
    });
    await this._audit("update", "default", normalized, before, after, context);
    return after;
  }

  async deleteDefaultFee(feeType, rowId, context) {
    const { feeType: normalized, table } = feeTable(feeType, "default");
    const customTable = CUSTOM_TABLES[normalized];
    const before = await db.transaction(async (tx) => {
      const before = await this._rowById(tx, table, rowId, undefined, {
        forUpdate: true,
      });
      const [custom] = await tx
        .select({ id: customTable.id })
        .from(customTable)
        .where(naturalKeyWhere(normalized, customTable, before))
        .limit(1);
      if (custom) {
        throw new ErrorClass("Default pricing cannot be deleted while custom overrides exist", 409);
      }
      await tx.delete(table).where(eq(table.id, before.id));
      return before;
    });
    await this._audit("delete", "default", normalized, before, null, context);
    return before;
  }

  async createMerchantFee(accountKey, feeType, payload, context) {
    const { feeType: normalized, table } = feeTable(feeType, "custom");
    const defaultTable = DEFAULT_TABLES[normalized];
    const values = validateFeePayload(normalized, payload, { scope: "custom" });
    const merchant = await this._merchant(accountKey);
    if (!merchant.user_key) {
      throw new ErrorClass("Merchant is missing the user key required for pricing", 409);
    }
    const [existing] = await db
      .select({ id: table.id })
      .from(table)
      .where(naturalKeyWhere(normalized, table, values, accountKey))
      .limit(1);
    if (existing) {
      throw new ErrorClass("Custom pricing already exists for this merchant and matching key", 409);
    }

    const created = await db.transaction(async (tx) => {
      const [matchingDefault] = await tx
        .select({ id: defaultTable.id })
        .from(defaultTable)
        .where(naturalKeyWhere(normalized, defaultTable, values))
        .limit(1)
        .for("update");
      if (!matchingDefault) {
        throw new ErrorClass("Create matching default pricing before adding a custom override", 409);
      }
      const timestamp = new Date();
      const result = await tx.insert(table).values({
        ...values,
        user_key: merchant.user_key,
        account_key: accountKey,
        is_enabled: values.is_enabled || "Y",
        identifier: crypto.randomUUID(),
        date_created: timestamp,
        date_modified: timestamp,
      });
      return this._rowById(tx, table, result[0].insertId, accountKey);
    });
    await this._audit(
      "create",
      "merchant",
      normalized,
      null,
      created,
      context,
      accountKey,
      merchant.user_key,
    );
    return created;
  }

  async updateMerchantFee(accountKey, feeType, rowId, payload, context) {
    const { feeType: normalized, table } = feeTable(feeType, "custom");
    const values = validateFeePayload(normalized, payload, {
      scope: "custom",
      partial: true,
    });
    const merchant = await this._merchant(accountKey);
    const { before, after } = await db.transaction(async (tx) => {
      const before = await this._rowById(tx, table, rowId, accountKey, {
        forUpdate: true,
      });
      await tx
        .update(table)
        .set({ ...values, date_modified: new Date() })
        .where(and(eq(table.id, before.id), eq(table.account_key, accountKey)));
      const after = await this._rowById(tx, table, before.id, accountKey);
      return { before, after };
    });
    await this._audit(
      "update",
      "merchant",
      normalized,
      before,
      after,
      context,
      accountKey,
      merchant.user_key || before.user_key,
    );
    return after;
  }

  async deleteMerchantFee(accountKey, feeType, rowId, context) {
    const { feeType: normalized, table } = feeTable(feeType, "custom");
    const merchant = await this._merchant(accountKey);
    const before = await db.transaction(async (tx) => {
      const before = await this._rowById(tx, table, rowId, accountKey, {
        forUpdate: true,
      });
      await tx
        .delete(table)
        .where(and(eq(table.id, before.id), eq(table.account_key, accountKey)));
      return before;
    });
    await this._audit(
      "delete",
      "merchant",
      normalized,
      before,
      null,
      context,
      accountKey,
      merchant.user_key || before.user_key,
    );
    return before;
  }

  async listPricingAudit({ limit = 50, offset = 0, feeType, accountKey } = {}) {
    const clauses = [];
    if (feeType) {
      clauses.push(eq(pricingFeeAuditEvents.fee_type, feeTypeDefinition(feeType).feeType));
    }
    if (accountKey) {
      clauses.push(eq(pricingFeeAuditEvents.account_key, accountKey));
    }
    const baseQuery = authDb.select().from(pricingFeeAuditEvents);
    const filteredQuery =
      clauses.length > 0 ? baseQuery.where(and(...clauses)) : baseQuery;
    return filteredQuery
      .orderBy(desc(pricingFeeAuditEvents.date_created))
      .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
      .offset(Math.max(Number(offset) || 0, 0));
  }
}
