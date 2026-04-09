#!/usr/bin/env node
/**
 * Force a user to have only the `management` RBAC role (auth DB).
 * Removes every other role row for that user, ensures `management` is linked,
 * sets legacy `Users.role` to `management`, and bumps `token_version` so JWTs must refresh.
 *
 * Usage:
 *   node scripts/set-user-management-only.js <email>
 *   node scripts/set-user-management-only.js <email> --dry-run
 *
 * Uses app env: AUTH_DB_NAME, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
 */
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
const dryRun = process.argv.includes("--dry-run");
const email = String(args[0] || "")
  .trim()
  .toLowerCase();

if (!email) {
  console.error("Usage: node scripts/set-user-management-only.js <email> [--dry-run]");
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
      "SELECT id, email, user_key, role AS legacy_role FROM Users WHERE LOWER(TRIM(email)) = ? LIMIT 1",
      [email],
    );
    const user = users[0];
    if (!user) {
      console.log(JSON.stringify({ ok: false, error: "No user found for email", email }, null, 2));
      process.exit(1);
    }

    const [roles] = await conn.query(
      "SELECT id, slug FROM rbac_roles WHERE slug = 'management' LIMIT 1",
    );
    const management = roles[0];
    if (!management) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "Role `management` not found. Run npm run migrate:auth-rbac first.",
          },
          null,
          2,
        ),
      );
      process.exit(1);
    }

    const [before] = await conn.query(
      `SELECT r.slug
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.slug`,
      [user.id],
    );

    const summary = {
      ok: true,
      dryRun,
      authDb: env.AUTH_DB_NAME,
      email: user.email,
      user_id: user.id,
      roles_before: before.map((r) => r.slug),
      actions: [
        "delete rbac_user_roles rows where role is not management",
        "insert rbac_user_roles for management if missing",
        "set Users.role = 'management'",
        "increment Users.token_version (forces re-login)",
      ],
    };

    if (dryRun) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    await conn.beginTransaction();

    const [delResult] = await conn.query(
      `DELETE ur FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug <> 'management'`,
      [user.id],
    );

    await conn.query(
      `INSERT IGNORE INTO rbac_user_roles (user_id, role_id, assigned_at, assigned_by_user_id)
       VALUES (?, ?, NOW(), NULL)`,
      [user.id, management.id],
    );

    await conn.query(
      `UPDATE Users
       SET role = 'management',
           token_version = COALESCE(token_version, 0) + 1,
           date_modified = NOW()
       WHERE id = ?`,
      [user.id],
    );

    await conn.commit();

    const [after] = await conn.query(
      `SELECT r.slug
       FROM rbac_user_roles ur
       INNER JOIN rbac_roles r ON r.id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY r.slug`,
      [user.id],
    );

    console.log(
      JSON.stringify(
        {
          ...summary,
          deleted_other_role_rows: delResult.affectedRows ?? 0,
          roles_after: after.map((r) => r.slug),
          message: "Done. User must log in again (token invalidated).",
        },
        null,
        2,
      ),
    );
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    console.error(err.message || err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
