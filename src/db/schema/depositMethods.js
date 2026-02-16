import { mysqlTable, int, char, datetime } from "drizzle-orm/mysql-core";

export const depositMethods = mysqlTable("DepositMethods", {
  id: int("id").primaryKey().autoincrement(),
  method: char("method", { length: 50 }).notNull(),
  currency_code: char("currency_code", { length: 5 }).notNull(),
  identifier: char("identifier", { length: 250 }).notNull().unique(),
  date_created: datetime("date_created").notNull(),
  date_modified: datetime("date_modified"),
});
