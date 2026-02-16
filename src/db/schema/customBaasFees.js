import { mysqlTable, int, char, varchar, double, datetime } from "drizzle-orm/mysql-core";

export const customBaaSDepositFees = mysqlTable("CustomBaaSDepositFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  method: char("method", { length: 50 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  charge_value: varchar("charge_value", { length: 250 }).notNull().default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).notNull().default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).notNull().default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const customBaaSPayoutFees = mysqlTable("CustomBaaSPayoutFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  method: char("method", { length: 50 }),
  currency_code: char("currency_code", { length: 5 }),
  charge_value: varchar("charge_value", { length: 250 }).default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  is_enabled: char("is_enabled", { length: 1 }),
  identifier: char("identifier", { length: 250 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const customBaaSSwapFees = mysqlTable("CustomBaaSSwapFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  charge_value: varchar("charge_value", { length: 250 }).notNull().default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).notNull().default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).notNull().default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const customBaaSTransferFees = mysqlTable("CustomBaaSTransferFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  sender_charge_value: varchar("sender_charge_value", { length: 250 }).notNull().default("0.00"),
  sender_charge_percentage: varchar("sender_charge_percentage", { length: 250 }).notNull().default("0.00"),
  sender_charge_cap: varchar("sender_charge_cap", { length: 250 }).notNull().default("0.00"),
  sender_vat_include: char("sender_vat_include", { length: 1 }).notNull().default("N"),
  recipient_charge_value: varchar("recipient_charge_value", { length: 250 }).notNull().default("0.00"),
  recipient_charge_percentage: varchar("recipient_charge_percentage", { length: 250 }).notNull().default("0.00"),
  recipient_charge_cap: varchar("recipient_charge_cap", { length: 250 }).notNull().default("0.00"),
  recipient_vat_include: char("recipient_vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const customBaaSWithdrawalFees = mysqlTable("CustomBaaSWithdrawalFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  charge_value: varchar("charge_value", { length: 250 }).default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  payer_type: char("payer_type", { length: 10 }).notNull().default("CUSTOMER"),
  payer_percentage: double("payer_percentage").notNull().default(100.0),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const customOverdraftProcessingFees = mysqlTable("CustomOverdraftProcessingFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  fee: varchar("fee", { length: 250 }).notNull(),
  cap: varchar("cap", { length: 250 }).notNull(),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const customWalletMaintenanceFees = mysqlTable("CustomWalletMaintenanceFees", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  fee: varchar("fee", { length: 250 }).notNull(),
  cap: varchar("cap", { length: 250 }).notNull().default("0.00"),
  is_enabled: char("is_enabled", { length: 1 }).notNull().default("Y"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});
