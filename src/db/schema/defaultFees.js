import { mysqlTable, int, char, varchar, double, datetime } from "drizzle-orm/mysql-core";

export const defaultBaaSDepositFees = mysqlTable("DefaultBaaSDepositFees", {
  id: int("id").primaryKey().autoincrement(),
  method: char("method", { length: 50 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  charge_value: varchar("charge_value", { length: 250 }).notNull().default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).notNull().default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).notNull().default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const defaultBaaSPayoutFees = mysqlTable("DefaultBaaSPayoutFees", {
  id: int("id").primaryKey().autoincrement(),
  method: char("method", { length: 50 }),
  currency_code: char("currency_code", { length: 5 }),
  charge_value: varchar("charge_value", { length: 250 }),
  charge_percentage: varchar("charge_percentage", { length: 250 }),
  charge_cap: varchar("charge_cap", { length: 250 }),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const defaultBaaSSwapFees = mysqlTable("DefaultBaaSSwapFees", {
  id: int("id").primaryKey().autoincrement(),
  currency_code: char("currency_code", { length: 5 }).notNull().unique(),
  charge_value: varchar("charge_value", { length: 250 }).notNull().default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).notNull().default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).notNull().default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const defaultBaaSTransferFees = mysqlTable("DefaultBaaSTransferFees", {
  id: int("id").primaryKey().autoincrement(),
  currency_code: char("currency_code", { length: 5 }).notNull().unique(),
  sender_charge_value: varchar("sender_charge_value", { length: 250 }).notNull().default("0.00"),
  sender_charge_percentage: varchar("sender_charge_percentage", { length: 250 }).notNull().default("0.00"),
  sender_charge_cap: varchar("sender_charge_cap", { length: 250 }).notNull().default("0.00"),
  sender_vat_include: char("sender_vat_include", { length: 1 }).notNull().default("N"),
  recipient_charge_value: varchar("recipient_charge_value", { length: 250 }).notNull().default("0.00"),
  recipient_charge_percentage: varchar("recipient_charge_percentage", { length: 250 }).notNull().default("0.00"),
  recipient_charge_cap: varchar("recipient_charge_cap", { length: 250 }).notNull().default("0.00"),
  recipient_vat_include: char("recipient_vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const defaultBaaSWithdrawalFees = mysqlTable("DefaultBaaSWithdrawalFees", {
  id: int("id").primaryKey().autoincrement(),
  currency_code: char("currency_code", { length: 5 }).notNull().unique(),
  charge_value: varchar("charge_value", { length: 250 }).default("0.00"),
  charge_percentage: varchar("charge_percentage", { length: 250 }).default("0.00"),
  charge_cap: varchar("charge_cap", { length: 250 }).default("0.00"),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  payer_type: char("payer_type", { length: 10 }).notNull().default("CUSTOMER"),
  payer_percentage: double("payer_percentage").notNull().default(100.0),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const defaultOverdraftProcessingFees = mysqlTable("DefaultOverdraftProcessingFees", {
  id: int("id").primaryKey().autoincrement(),
  currency_code: char("currency_code", { length: 5 }).notNull().unique(),
  fee: varchar("fee", { length: 250 }).notNull(),
  cap: varchar("cap", { length: 250 }).notNull(),
  vat_include: char("vat_include", { length: 1 }).notNull().default("N"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});

export const defaultWalletMaintenanceFees = mysqlTable("DefaultWalletMaintenanceFees", {
  id: int("id").primaryKey().autoincrement(),
  currency_code: char("currency_code", { length: 5 }).notNull().unique(),
  fee: varchar("fee", { length: 250 }).notNull(),
  cap: varchar("cap", { length: 250 }).notNull().default("0.00"),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});
