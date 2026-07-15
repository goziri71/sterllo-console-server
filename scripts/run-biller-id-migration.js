#!/usr/bin/env node
/**
 * Add biller_id column to Users on the auth DB (crosslink login).
 *
 * Usage:
 *   npm run migrate:biller-id
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const sqlPath = join(__dirname, "migrations", "003_add_biller_id_to_users_mysql.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.AUTH_DB_NAME,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log(
      JSON.stringify(
        { ok: true, message: "biller_id column added to Users", authDb: env.AUTH_DB_NAME },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error.code === "ER_DUP_FIELDNAME") {
      console.log(
        JSON.stringify(
          {
            ok: true,
            skipped: true,
            message: "biller_id column already exists",
            authDb: env.AUTH_DB_NAME,
          },
          null,
          2,
        ),
      );
      return;
    }
    throw error;
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
