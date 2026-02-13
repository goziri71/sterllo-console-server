import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { db, pool } from "./db/index.js";
import { sql as rawSql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runSqlDump() {
  try {
    await db.execute(rawSql`SELECT 1`);
    console.log("Database connection established.\n");

    // Read the SQL dump file
    const sqlPath = join(__dirname, "migrationsql.js");
    let sql = readFileSync(sqlPath, "utf8");

    // Remove GTID_PURGED statement (requires SUPER privilege)
    sql = sql.replace(/SET @@GLOBAL\.GTID_PURGED.*?;\n/g, "");

    // Remove SET @@SESSION.SQL_LOG_BIN lines (requires SUPER privilege)
    sql = sql.replace(/SET @MYSQLDUMP_TEMP_LOG_BIN.*?;\n/g, "");
    sql = sql.replace(/SET @@SESSION\.SQL_LOG_BIN.*?;\n/g, "");

    // Split into individual statements
    // We need to handle the /*!...*/ conditional comments properly
    const statements = sql
      .split(/;\n/)
      .map((s) => s.trim())
      .filter(
        (s) =>
          s.length > 0 &&
          !s.startsWith("--") &&
          s !== "" &&
          !s.match(/^\/\*!\d+\s*\*\/\s*$/) &&
          !s.match(/^-- Dump completed/)
      );

    console.log(`Found ${statements.length} SQL statements to execute.\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] + ";";

      // Skip empty or comment-only statements
      const stripped = stmt
        .replace(/\/\*![\s\S]*?\*\//g, "")
        .replace(/--.*$/gm, "")
        .trim();
      if (stripped === ";" || stripped === "") continue;

      try {
        await pool.query(stmt);
        successCount++;

        // Log progress for CREATE TABLE and INSERT statements
        const createMatch = stmt.match(/CREATE TABLE.*?`(\w+)`/);
        const insertMatch = stmt.match(/INSERT INTO `(\w+)`/);
        const dropMatch = stmt.match(/DROP TABLE IF EXISTS `(\w+)`/);

        if (createMatch) {
          console.log(`  ✓ Created table: ${createMatch[1]}`);
        } else if (insertMatch) {
          console.log(`  ✓ Inserted data into: ${insertMatch[1]}`);
        } else if (dropMatch) {
          console.log(`  ✓ Dropped (if exists): ${dropMatch[1]}`);
        }
      } catch (error) {
        // Skip non-critical errors (like SET statements that need SUPER)
        if (
          error.message.includes("SUPER") ||
          error.message.includes("GTID") ||
          error.message.includes("SQL_LOG_BIN")
        ) {
          console.log(`  ⚠ Skipped (requires SUPER): ${stmt.substring(0, 60)}...`);
          continue;
        }
        errorCount++;
        console.error(
          `  ✗ Error on statement ${i + 1}: ${error.message}`
        );
        console.error(`    Statement: ${stmt.substring(0, 100)}...`);
      }
    }

    console.log(`\n--- Migration Summary ---`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Done!`);
  } catch (error) {
    console.error("Failed to run SQL dump:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSqlDump();
