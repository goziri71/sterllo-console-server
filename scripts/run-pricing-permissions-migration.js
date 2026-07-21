#!/usr/bin/env node
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const sql = readFileSync(
    join(__dirname, "migrations", "006_pricing_permissions_auth_mysql.sql"),
    "utf8",
  );
  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.AUTH_DB_NAME,
    multipleStatements: true,
  });

  try {
    await connection.query(sql);
    console.log(JSON.stringify({
      ok: true,
      message: "Pricing permissions and auth-database audit history are ready",
      authDb: env.AUTH_DB_NAME,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
