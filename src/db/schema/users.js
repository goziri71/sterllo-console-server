import { mysqlTable, int, varchar, datetime } from "drizzle-orm/mysql-core";

export const users = mysqlTable("Users", {
  
  id: int("id").primaryKey().autoincrement(),

  user_key: varchar("user_key", { length: 600 }).unique(),

  email: varchar("email", { length: 255 }).notNull().unique(),

  password: varchar("password", { length: 255 }).notNull(),

  first_name: varchar("first_name", { length: 150 }),

  last_name: varchar("last_name", { length: 150 }),

  role: varchar("role", { length: 100 }),

  last_login: datetime("last_login"),

  date_created: datetime("date_created"),

  date_modified: datetime("date_modified"),
});
