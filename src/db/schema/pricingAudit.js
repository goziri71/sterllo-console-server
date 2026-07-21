import {
  mysqlTable,
  bigint,
  int,
  varchar,
  datetime,
  text,
  index,
} from "drizzle-orm/mysql-core";

export const pricingFeeAuditEvents = mysqlTable(
  "PricingFeeAuditEvents",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    actor_user_id: int("actor_user_id").notNull(),
    actor_user_key: varchar("actor_user_key", { length: 600 }).notNull(),
    actor_session_id: varchar("actor_session_id", { length: 36 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    scope: varchar("scope", { length: 20 }).notNull(),
    fee_type: varchar("fee_type", { length: 40 }).notNull(),
    fee_row_id: int("fee_row_id"),
    merchant_user_key: varchar("merchant_user_key", { length: 30 }),
    account_key: varchar("account_key", { length: 30 }),
    before_json: text("before_json"),
    after_json: text("after_json"),
    ip_address: varchar("ip_address", { length: 64 }),
    user_agent: varchar("user_agent", { length: 512 }),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    index("pricing_audit_actor_idx").on(table.actor_user_id),
    index("pricing_audit_actor_key_idx").on(table.actor_user_key),
    index("pricing_audit_merchant_idx").on(table.account_key),
    index("pricing_audit_type_idx").on(table.fee_type),
    index("pricing_audit_date_idx").on(table.date_created),
  ],
);
