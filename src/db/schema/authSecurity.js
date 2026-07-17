import {
  mysqlTable,
  int,
  bigint,
  varchar,
  datetime,
  tinyint,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const authMfaFactors = mysqlTable(
  "auth_mfa_factors",
  {
    id: int("id").primaryKey().autoincrement(),
    user_id: int("user_id").notNull(),
    factor_type: varchar("factor_type", { length: 30 }).notNull().default("totp"),
    secret_ciphertext: varchar("secret_ciphertext", { length: 1024 }).notNull(),
    secret_iv: varchar("secret_iv", { length: 32 }).notNull(),
    secret_tag: varchar("secret_tag", { length: 32 }).notNull(),
    is_enabled: tinyint("is_enabled").notNull().default(0),
    last_used_step: bigint("last_used_step", { mode: "number" }),
    enrolled_at: datetime("enrolled_at"),
    date_created: datetime("date_created").notNull(),
    date_modified: datetime("date_modified").notNull(),
  },
  (table) => [
    uniqueIndex("auth_mfa_factor_user_uq").on(table.user_id),
    index("auth_mfa_factor_enabled_idx").on(table.is_enabled),
  ],
);

export const authMfaRecoveryCodes = mysqlTable(
  "auth_mfa_recovery_codes",
  {
    id: int("id").primaryKey().autoincrement(),
    user_id: int("user_id").notNull(),
    code_hash: varchar("code_hash", { length: 64 }).notNull(),
    used_at: datetime("used_at"),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    uniqueIndex("auth_mfa_recovery_code_hash_uq").on(table.code_hash),
    index("auth_mfa_recovery_user_idx").on(table.user_id),
  ],
);

export const authLoginChallenges = mysqlTable(
  "auth_login_challenges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: int("user_id").notNull(),
    purpose: varchar("purpose", { length: 30 }).notNull(),
    token_hash: varchar("token_hash", { length: 64 }).notNull(),
    attempts: int("attempts").notNull().default(0),
    max_attempts: int("max_attempts").notNull().default(5),
    expires_at: datetime("expires_at").notNull(),
    consumed_at: datetime("consumed_at"),
    context_json: text("context_json"),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    uniqueIndex("auth_login_challenge_token_uq").on(table.token_hash),
    index("auth_login_challenge_user_idx").on(table.user_id),
    index("auth_login_challenge_expiry_idx").on(table.expires_at),
  ],
);

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    user_id: int("user_id").notNull(),
    auth_method: varchar("auth_method", { length: 30 }).notNull(),
    mfa_verified_at: datetime("mfa_verified_at").notNull(),
    ip_address: varchar("ip_address", { length: 64 }),
    user_agent: varchar("user_agent", { length: 512 }),
    device_label: varchar("device_label", { length: 150 }),
    last_seen_at: datetime("last_seen_at").notNull(),
    expires_at: datetime("expires_at").notNull(),
    is_active: tinyint("is_active").default(1),
    revoked_at: datetime("revoked_at"),
    revoke_reason: varchar("revoke_reason", { length: 100 }),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    uniqueIndex("auth_session_one_active_user_uq").on(
      table.user_id,
      table.is_active,
    ),
    index("auth_session_user_idx").on(table.user_id),
    index("auth_session_active_idx").on(table.user_id, table.revoked_at, table.expires_at),
  ],
);

export const authSecurityEvents = mysqlTable(
  "auth_security_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    user_id: int("user_id"),
    session_id: varchar("session_id", { length: 36 }),
    event_type: varchar("event_type", { length: 80 }).notNull(),
    ip_address: varchar("ip_address", { length: 64 }),
    user_agent: varchar("user_agent", { length: 512 }),
    metadata_json: text("metadata_json"),
    date_created: datetime("date_created").notNull(),
  },
  (table) => [
    index("auth_security_event_user_idx").on(table.user_id),
    index("auth_security_event_type_idx").on(table.event_type),
    index("auth_security_event_date_idx").on(table.date_created),
  ],
);
