import { mysqlTable, int, char, varchar, datetime } from "drizzle-orm/mysql-core";

export const cryptoDepositAddresses = mysqlTable("CryptocurrencyDepositAddresses", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  identifier: char("identifier", { length: 250 }),
  wallet_key: char("wallet_key", { length: 30 }).notNull(),
  type: char("type", { length: 10 }).notNull(),
  service: char("service", { length: 20 }).notNull(),
  asset: char("asset", { length: 20 }).notNull(),
  network: char("network", { length: 50 }).notNull(),
  address_name: char("address_name", { length: 100 }).notNull(),
  address: varchar("address", { length: 250 }),
  u_id: char("u_id", { length: 30 }).notNull(),
  source: char("source", { length: 50 }),
  reference: char("reference", { length: 250 }).notNull().unique(),
  vendor: char("vendor", { length: 50 }).notNull(),
  vendor_wallet_id: char("vendor_wallet_id", { length: 250 }),
  ip_address: char("ip_address", { length: 100 }).notNull(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const cryptoAssets = mysqlTable("CryptocurrencyAssets", {
  id: int("id").primaryKey().autoincrement(),
  asset_id: char("asset_id", { length: 250 }).unique(),
  asset: char("asset", { length: 50 }).notNull(),
  network_name: char("network_name", { length: 50 }),
  network_code: char("network_code", { length: 20 }).notNull(),
  default_network_name: char("default_network_name", { length: 50 }).notNull(),
  default_network_code: char("default_network_code", { length: 20 }).notNull(),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  vendor: char("vendor", { length: 50 }).notNull(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const blockradarWalletIDs = mysqlTable("BlockradarWalletIDs", {
  id: int("id").primaryKey().autoincrement(),
  network: char("network", { length: 20 }).notNull().unique(),
  wallet_id: char("wallet_id", { length: 250 }).notNull().unique(),
  identifier: char("identifier", { length: 250 }).notNull(),
  is_deleted: char("is_deleted", { length: 1 }).notNull().default("N"),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});
