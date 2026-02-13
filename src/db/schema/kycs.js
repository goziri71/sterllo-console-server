import { mysqlTable, int, char, datetime } from "drizzle-orm/mysql-core";

export const kycs = mysqlTable("KYCs", {
  id: int("id").primaryKey().autoincrement(),
  user_key: char("user_key", { length: 30 }),
  account_key: char("account_key", { length: 30 }),
  identifier: char("identifier", { length: 250 }),
  identification_type: char("identification_type", { length: 100 }),
  identification_number: char("identification_number", { length: 50 }),
  issued_date: char("issued_date", { length: 10 }),
  expiry_date: char("expiry_date", { length: 10 }),
  is_compliant: char("is_compliant", { length: 1 }),
  reference: char("reference", { length: 250 }).unique(),
  source: char("source", { length: 50 }),
  ip_address: char("ip_address", { length: 39 }),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});
