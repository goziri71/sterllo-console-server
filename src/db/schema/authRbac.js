import {
  mysqlTable,
  int,
  varchar,
  datetime,
  tinyint,
  primaryKey,
  index,
} from "drizzle-orm/mysql-core";

export const rbacPermissions = mysqlTable("rbac_permissions", {
  id: int("id").primaryKey().autoincrement(),
  permission_key: varchar("permission_key", { length: 120 }).notNull().unique(),
  description: varchar("description", { length: 255 }),
  date_created: datetime("date_created"),
});

export const rbacRoles = mysqlTable("rbac_roles", {
  id: int("id").primaryKey().autoincrement(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 150 }).notNull(),
  is_system: tinyint("is_system").notNull().default(0),
  date_created: datetime("date_created"),
  date_modified: datetime("date_modified"),
});

export const rbacRolePermissions = mysqlTable(
  "rbac_role_permissions",
  {
    role_id: int("role_id").notNull(),
    permission_id: int("permission_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.role_id, t.permission_id] }),
    index("rbac_rp_permission_id_idx").on(t.permission_id),
  ],
);

export const rbacUserRoles = mysqlTable(
  "rbac_user_roles",
  {
    user_id: int("user_id").notNull(),
    role_id: int("role_id").notNull(),
    assigned_at: datetime("assigned_at").notNull(),
    assigned_by_user_id: int("assigned_by_user_id"),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.role_id] }),
    index("rbac_ur_role_id_idx").on(t.role_id),
    index("rbac_ur_assigner_idx").on(t.assigned_by_user_id),
  ],
);
