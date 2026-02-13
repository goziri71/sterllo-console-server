import { mysqlTable, int, char, double, text, datetime } from "drizzle-orm/mysql-core";

export const currencies = mysqlTable("Currencies", {
  id: int("id").primaryKey().autoincrement(),
  name: char("name", { length: 100 }),
  code: char("code", { length: 5 }).unique(),
  symbol: char("symbol", { length: 5 }),
  category: char("category", { length: 10 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const vats = mysqlTable("VATs", {
  id: int("id").primaryKey().autoincrement(),
  identifier: char("identifier", { length: 250 }).unique(),
  country_code: char("country_code", { length: 3 }).unique(),
  percentage: double("percentage"),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const customerTiers = mysqlTable("CustomerTiers", {
  id: int("id").primaryKey().autoincrement(),
  tier: int("tier"),
  country_code: char("country_code", { length: 3 }),
  currency_code: char("currency_code", { length: 5 }),
  min_balance: double("min_balance"),
  max_balance: double("max_balance"),
  min_credit: double("min_credit"),
  max_credit: double("max_credit"),
  daily_credit_value_limit: double("daily_credit_value_limit"),
  daily_credit_volume_limit: int("daily_credit_volume_limit"),
  weekly_credit_value_limit: double("weekly_credit_value_limit"),
  weekly_credit_volume_limit: int("weekly_credit_volume_limit"),
  monthly_credit_value_limit: double("monthly_credit_value_limit"),
  monthly_credit_volume_limit: int("monthly_credit_volume_limit"),
  min_debit: double("min_debit"),
  max_debit: double("max_debit"),
  daily_debit_value_limit: double("daily_debit_value_limit"),
  daily_debit_volume_limit: int("daily_debit_volume_limit"),
  weekly_debit_value_limit: double("weekly_debit_value_limit"),
  weekly_debit_volume_limit: int("weekly_debit_volume_limit"),
  monthly_debit_value_limit: double("monthly_debit_value_limit"),
  monthly_debit_volume_limit: int("monthly_debit_volume_limit"),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const whitelistedIPs = mysqlTable("WhitelistedIPAddresses", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  user_client_key: char("user_client_key", { length: 100 }),
  account_client_key: char("account_client_key", { length: 100 }),
  ip_addresses: text("ip_addresses"),
  identifier: char("identifier", { length: 250 }).unique(),
  is_enabled: char("is_enabled", { length: 1 }),
  ip_address: char("ip_address", { length: 39 }),
  session_id: char("session_id", { length: 30 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});
