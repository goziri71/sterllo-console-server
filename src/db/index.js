import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

export const db = drizzle(pool);
export { pool };
