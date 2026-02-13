import { mysqlTable, int, char, datetime } from "drizzle-orm/mysql-core";

export const transactionDisputes = mysqlTable("TransactionDisputes", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  transaction_wallet_key: char("transaction_wallet_key", { length: 30 }),
  settlement_wallet_key: char("settlement_wallet_key", { length: 30 }),
  transaction_reference: char("transaction_reference", { length: 250 }).unique(),
  dispute_reference: char("dispute_reference", { length: 250 }).unique(),
  settlement_reference: char("settlement_reference", { length: 250 }).unique(),
  settlement_status: char("settlement_status", { length: 10 }),
  status: char("status", { length: 10 }),
  ip_address: char("ip_address", { length: 39 }),
  session_id: char("session_id", { length: 30 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});
