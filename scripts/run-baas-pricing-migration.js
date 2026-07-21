#!/usr/bin/env node
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const UNIQUE_SPECS = [
  ["DefaultBaaSDepositFees", "pricing_default_deposit_key_uq", ["method", "currency_code"]],
  ["DefaultBaaSPayoutFees", "pricing_default_payout_key_uq", ["method", "currency_code"]],
  ["DefaultBaaSSwapFees", "pricing_default_swap_key_uq", ["currency_code"]],
  ["DefaultBaaSTransferFees", "pricing_default_transfer_key_uq", ["currency_code"]],
  ["DefaultBaaSWithdrawalFees", "pricing_default_withdrawal_key_uq", ["currency_code"]],
  ["DefaultOverdraftProcessingFees", "pricing_default_overdraft_key_uq", ["currency_code"]],
  ["DefaultWalletMaintenanceFees", "pricing_default_wallet_key_uq", ["currency_code"]],
  ["CustomBaaSDepositFees", "pricing_custom_deposit_key_uq", ["account_key", "method", "currency_code"]],
  ["CustomBaaSPayoutFees", "pricing_custom_payout_key_uq", ["account_key", "method", "currency_code"]],
  ["CustomBaaSSwapFees", "pricing_custom_swap_key_uq", ["account_key", "currency_code"]],
  ["CustomBaaSTransferFees", "pricing_custom_transfer_key_uq", ["account_key", "currency_code"]],
  ["CustomBaaSWithdrawalFees", "pricing_custom_withdrawal_key_uq", ["account_key", "currency_code"]],
  ["CustomOverdraftProcessingFees", "pricing_custom_overdraft_key_uq", ["account_key", "currency_code"]],
  ["CustomWalletMaintenanceFees", "pricing_custom_wallet_key_uq", ["account_key", "currency_code"]],
];

const quote = (value) => `\`${String(value).replaceAll("`", "``")}\``;

async function assertCleanNaturalKeys(connection, table, columns) {
  const nullPredicate = columns.map((column) => `${quote(column)} IS NULL`).join(" OR ");
  const [[nullResult]] = await connection.query(
    `SELECT COUNT(*) AS total FROM ${quote(table)} WHERE ${nullPredicate}`,
  );
  if (Number(nullResult.total) > 0) {
    throw new Error(
      `${table} has ${nullResult.total} row(s) with null natural-key values; clean them before migrating`,
    );
  }

  const grouped = columns.map(quote).join(", ");
  const [duplicates] = await connection.query(
    `SELECT ${grouped}, COUNT(*) AS total FROM ${quote(table)} GROUP BY ${grouped} HAVING COUNT(*) > 1 LIMIT 5`,
  );
  if (duplicates.length > 0) {
    throw new Error(
      `${table} contains duplicate pricing keys; clean them before migrating: ${JSON.stringify(duplicates)}`,
    );
  }
}

async function ensureUniqueIndex(connection, table, indexName, columns) {
  const [existing] = await connection.query(
    `SELECT INDEX_NAME,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns_list
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0
     GROUP BY INDEX_NAME`,
    [table],
  );
  if (existing.some((index) => index.columns_list === columns.join(","))) return;
  await connection.query(
    `ALTER TABLE ${quote(table)} ADD UNIQUE KEY ${quote(indexName)} (${columns.map(quote).join(", ")})`,
  );
}

async function run() {
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true,
  });

  try {
    for (const [table, , columns] of UNIQUE_SPECS) {
      await assertCleanNaturalKeys(connection, table, columns);
    }
    for (const [table, indexName, columns] of UNIQUE_SPECS) {
      await ensureUniqueIndex(connection, table, indexName, columns);
    }
    console.log(JSON.stringify({
      ok: true,
      message: "BaaS pricing natural-key constraints are ready",
      mainDb: env.DB_NAME,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
