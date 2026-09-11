import {
  mysqlTable,
  bigint,
  int,
  varchar,
  datetime,
  text,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Console command-center audit trail (auth DB).
 * One row per team action — used for live SSE feed + history.
 */
export const consoleAuditEvents = mysqlTable(
  "console_audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    event_type: varchar("event_type", { length: 64 }).notNull(),
    outcome: varchar("outcome", { length: 20 }).notNull().default("success"),
    actor_user_id: int("actor_user_id"),
    actor_user_key: varchar("actor_user_key", { length: 128 }),
    actor_email: varchar("actor_email", { length: 255 }),
    actor_role: varchar("actor_role", { length: 64 }),
    actor_name: varchar("actor_name", { length: 255 }),
    session_id: varchar("session_id", { length: 64 }),
    target_type: varchar("target_type", { length: 64 }),
    target_key: varchar("target_key", { length: 255 }),
    account_key: varchar("account_key", { length: 128 }),
    reference: varchar("reference", { length: 255 }),
    summary: varchar("summary", { length: 512 }).notNull(),
    metadata_json: text("metadata_json"),
    ip_address: varchar("ip_address", { length: 64 }),
    user_agent: varchar("user_agent", { length: 512 }),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    index("console_audit_created_idx").on(table.date_created),
    index("console_audit_type_idx").on(table.event_type),
    index("console_audit_actor_idx").on(table.actor_user_id),
    index("console_audit_account_idx").on(table.account_key),
    index("console_audit_reference_idx").on(table.reference),
  ],
);
