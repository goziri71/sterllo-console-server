/**
 * Drizzle Kit migration helper
 *
 * Usage:
 *   npx drizzle-kit generate   -- Generate migration files from schema changes
 *   npx drizzle-kit push       -- Push schema directly to DB (dev)
 *   npx drizzle-kit migrate    -- Run pending migrations (production)
 *   npx drizzle-kit introspect -- Pull existing DB schema into Drizzle format
 *
 * This file is kept for backwards compatibility with the old npm scripts.
 * It proxies to drizzle-kit commands.
 */

import { execSync } from "child_process";

const command = process.argv[2];

const commands = {
  push: "npx drizzle-kit push",
  generate: "npx drizzle-kit generate",
  migrate: "npx drizzle-kit migrate",
  introspect: "npx drizzle-kit introspect",
  status: "npx drizzle-kit check",
};

if (!command || !commands[command]) {
  console.log("Usage: node src/migrate.js <command>\n");
  console.log("Commands:");
  console.log("  push        Push schema to DB (development)");
  console.log("  generate    Generate migration SQL from schema changes");
  console.log("  migrate     Run pending migration files (production)");
  console.log("  introspect  Pull existing DB schema into Drizzle format");
  console.log("  status      Check for schema drift");
  process.exit(0);
}

try {
  execSync(commands[command], { stdio: "inherit" });
} catch (error) {
  process.exit(1);
}
