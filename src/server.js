import app from "../app.js";
import { env } from "./config/env.js";
import { db, pool } from "./db/index.js";
import { sql } from "drizzle-orm";
import { setApp } from "./utils/jwt/index.js";

const verifyDatabaseConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log("Database TCP connection and ping successful");
  } finally {
    if (connection) connection.release();
  }
};

const startServer = async () => {
  try {
    await verifyDatabaseConnection();
    await db.execute(sql`SELECT 1`);
    console.log("Database query check successful");

    // Make Fastify instance available to JWT utility after plugins are loaded
    await app.ready();
    setApp(app);

    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);

    process.on("SIGTERM", () => {
      console.log("SIGTERM signal received: shutting down gracefully");
      app.close().then(() => {
        pool.end();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    if (error && typeof error === "object") {
      console.error("Database startup diagnostics:", {
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        mode: env.DB_MODE,
      });
    }
    process.exit(1);
  }
};

startServer();
