import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default bootstrap account; override with `BOOTSTRAP_MANAGEMENT_EMAIL` or options. */
export const DEFAULT_BOOTSTRAP_MANAGEMENT_EMAIL = "goziri71@gmail.com";

/**
 * Applies `001_auth_rbac_mysql.sql` and `002_auth_rbac_financial_read_mysql.sql` (if present)
 * to the auth database,
 * then ensures the bootstrap user has the `management` role (if that user exists).
 *
 * @param {object} [options]
 * @param {string} [options.bootstrapManagementEmail]
 * @param {string} [options.migrationSqlPath] - absolute or relative path override
 * @returns {Promise<{ ok: true, bootstrapManagementEmail: string, managementAssignment: "inserted" | "already_present" | "skipped_no_user" | "skipped_no_management_role", warning?: string }>}
 */
export async function runAuthRbacMigration(options = {}) {
  const bootstrapEmail = String(
    options.bootstrapManagementEmail ??
      process.env.BOOTSTRAP_MANAGEMENT_EMAIL ??
      DEFAULT_BOOTSTRAP_MANAGEMENT_EMAIL,
  )
    .trim()
    .toLowerCase();

  const migrationsDir = join(__dirname, "..", "..", "scripts", "migrations");
  const defaultMigrations = [
    join(migrationsDir, "001_auth_rbac_mysql.sql"),
    join(migrationsDir, "002_auth_rbac_financial_read_mysql.sql"),
  ];

  const connectionConfig = {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.AUTH_DB_NAME,
    multipleStatements: true,
  };

  let conn;
  try {
    conn = await mysql.createConnection(connectionConfig);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      const target = `${connectionConfig.host}:${connectionConfig.port}`;
      const hint =
        "Nothing is accepting connections there. Start MySQL (or your DB tunnel), or fix DB_HOST / DB_PORT in .env (default MySQL is often 3306).";
      throw new Error(`Cannot reach MySQL at ${target} (auth DB: ${connectionConfig.database}). ${hint}\nOriginal: ${err.message}`);
    }
    throw err;
  }

  try {
    try {
      if (options.migrationSqlPath) {
        await conn.query(readFileSync(options.migrationSqlPath, "utf8"));
      } else {
        for (const filePath of defaultMigrations) {
          if (existsSync(filePath)) {
            await conn.query(readFileSync(filePath, "utf8"));
          }
        }
      }
    } catch (err) {
      if (err.errno === 1142 && String(err.message || "").includes("REFERENCES")) {
        throw new Error(
          "MySQL denied FOREIGN KEY creation (REFERENCES privilege). Pull the latest migration (no-FK version) or drop rbac_* tables and re-run.\nOriginal: " +
            err.message,
        );
      }
      if (err.errno === 1267) {
        throw new Error(
          "Collation mismatch (1267). Pull the latest migration (utf8mb4_0900_ai_ci + COLLATE on Users backfill join). If rbac_* tables already exist with an old collation, DROP them and re-run.\nOriginal: " +
            err.message,
        );
      }
      throw err;
    }

    const [userRows] = await conn.query(
      "SELECT id FROM Users WHERE LOWER(TRIM(email)) = ? LIMIT 1",
      [bootstrapEmail],
    );
    const userRow = userRows[0];

    if (!userRow) {
      return {
        ok: true,
        bootstrapManagementEmail: bootstrapEmail,
        managementAssignment: "skipped_no_user",
        warning: `No row in Users for ${bootstrapEmail}. Register that account, then re-run this migration or assign management via POST /rbac/users/:userKey/roles.`,
      };
    }

    const [roleRows] = await conn.query(
      "SELECT id FROM rbac_roles WHERE slug = 'management' LIMIT 1",
    );
    const roleRow = roleRows[0];

    if (!roleRow) {
      return {
        ok: true,
        bootstrapManagementEmail: bootstrapEmail,
        managementAssignment: "skipped_no_management_role",
        warning: "rbac_roles.management missing after migration; check SQL seed.",
      };
    }

    const [insertResult] = await conn.query(
      `INSERT IGNORE INTO rbac_user_roles (user_id, role_id, assigned_at, assigned_by_user_id)
       VALUES (?, ?, NOW(), NULL)`,
      [userRow.id, roleRow.id],
    );

    const inserted = insertResult.affectedRows > 0;

    return {
      ok: true,
      bootstrapManagementEmail: bootstrapEmail,
      managementAssignment: inserted ? "inserted" : "already_present",
    };
  } finally {
    if (conn) await conn.end();
  }
}
