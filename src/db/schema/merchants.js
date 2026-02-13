import { mysqlTable, int, char, datetime } from "drizzle-orm/mysql-core";

export const merchants = mysqlTable("Merchants", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  name: char("name", { length: 100 }),
  trade_name: char("trade_name", { length: 50 }),
  wallet_identifier: char("wallet_identifier", { length: 250 }).unique(),
  ledger_identifier: char("ledger_identifier", { length: 250 }).unique(),
  default_kyc_tier: int("default_kyc_tier"),
  session_id: char("session_id", { length: 30 }),
  ip_address: char("ip_address", { length: 39 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const merchantLedgers = mysqlTable("MerchantLedgers", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  environment: char("environment", { length: 10 }),
  wallet_key: char("wallet_key", { length: 30 }).unique(),
  wallet_id: char("wallet_id", { length: 250 }).unique(),
  charge_ledger_key: char("charge_ledger_key", { length: 30 }).unique(),
  vat_ledger_key: char("vat_ledger_key", { length: 30 }).unique(),
  reference: char("reference", { length: 250 }).unique(),
  currency_code: char("currency_code", { length: 5 }),
  source: char("source", { length: 50 }),
  ip_address: char("ip_address", { length: 39 }),
  session_id: char("session_id", { length: 30 }),
  date_created: datetime("date_created"),
});

export const settlementLedgers = mysqlTable("SettlementLedgers", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  type: char("type", { length: 10 }),
  wallet_key: char("wallet_key", { length: 30 }).unique(),
  currency_code: char("currency_code", { length: 5 }),
  identifier: char("identifier", { length: 250 }).unique(),
  ip_address: char("ip_address", { length: 39 }),
  session_id: char("session_id", { length: 30 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});
