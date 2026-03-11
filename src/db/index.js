import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";

const buildPool = (database) =>
  mysql.createPool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database,
  });

const pool = buildPool(env.DB_NAME);
const authPool = buildPool(env.AUTH_DB_NAME);

export const db = drizzle(pool);
export const authDb = drizzle(authPool);
export { pool, authPool };
