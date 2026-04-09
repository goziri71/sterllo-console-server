#!/usr/bin/env node
/**
 * Inspect RBAC state for a user (auth DB). Usage:
 *   node scripts/inspect-user-rbac.js goziri71@gmail.com
 * Uses the same env as the app (AUTH_DB_NAME, DB_*).
 */
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const email = String(process.argv[2] || "")
  .trim()
  .toLowerCase();
if (!email) {
  console.error("Usage: node scripts/inspect-user-rbac.js <email>");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.AUTH_DB_NAME,
  });

  try {
    const [users] = await conn.query(
      "SELECT id, email, user_key, role AS legacy_role_column FROM Users WHERE LOWER(TRIM(email)) = ? LIMIT 1",
      [email],
    );
    const u = users[0];
    if (!u) {
      console.log(JSON.stringify({ ok: false, error: "No user row in Users for this email", email, authDb: env.AUTH_DB_NAME }, null, 2));
      return;
    }

    const [tables] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'rbac_user_roles'",
    );
    if (!tables[0]?.c) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "RBAC tables missing — run npm run migrate:auth-rbac on this database",
            user: u,
            authDb: env.AUTH_DB_NAME,
          },
          null,
          2,
        ),
      );
      return;
    }

    const [roleRows] = await conn.query(
      `SELECT r.slug, r.label, ur.assigned_at
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.slug`,
      [u.id],
    );

    const [permRows] = await conn.query(
      `SELECT DISTINCT p.permission_key
       FROM rbac_user_roles ur
       INNER JOIN rbac_role_permissions rp ON rp.role_id = ur.role_id
       INNER JOIN rbac_permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ?
       ORDER BY p.permission_key`,
      [u.id],
    );

    const permissionKeys = permRows.map((row) => row.permission_key);
    const hasStar = permissionKeys.includes("*");
    const hasRbacManage = permissionKeys.includes("rbac.manage");

    console.log(
      JSON.stringify(
        {
          ok: true,
          authDb: env.AUTH_DB_NAME,
          user: {
            id: u.id,
            email: u.email,
            user_key: u.user_key,
            legacy_Users_role_column: u.legacy_role_column ?? null,
            note: "Effective API access uses rbac_user_roles only; legacy column is not read at runtime.",
          },
          rbac_roles: roleRows,
          effective_permission_keys: permissionKeys,
          checks: {
            has_management_full_access_via_star: hasStar,
            can_use_rbac_admin_endpoints: hasStar || hasRbacManage,
            management_role_slugs: roleRows.map((r) => r.slug).filter((s) => s === "management"),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
