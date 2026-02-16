import { mysqlTable, int, char, text, datetime } from "drizzle-orm/mysql-core";

export const udara360APICredentials = mysqlTable("Udara360APICredentials", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }).notNull(),
  account_key: char("account_key", { length: 30 }).notNull(),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  account_number: char("account_number", { length: 10 }).notNull().unique(),
  auth_type: char("auth_type", { length: 50 }).notNull().default("BEARER"),
  client_id: text("client_id").notNull(),
  client_secret: text("client_secret").notNull(),
  token: text("token"),
  expiry_date: datetime("expiry_date"),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});
