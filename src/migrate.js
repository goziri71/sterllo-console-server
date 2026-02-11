import { Umzug, SequelizeStorage } from "umzug";
import sequelize from "./config/database.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const umzug = new Umzug({
  migrations: {
    glob: "src/migrations/*.js",
    resolve: ({ name, path: migrationPath }) => {
      return {
        name,
        up: async (params) => {
          // migrationPath can be absolute or relative, handle both cases
          const absolutePath = migrationPath.startsWith('/') 
            ? migrationPath 
            : join(process.cwd(), migrationPath);
          const migration = await import(`file://${absolutePath}`);
          return migration.up(params);
        },
        down: async (params) => {
          // migrationPath can be absolute or relative, handle both cases
          const absolutePath = migrationPath.startsWith('/') 
            ? migrationPath 
            : join(process.cwd(), migrationPath);
          const migration = await import(`file://${absolutePath}`);
          return migration.down(params);
        },
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

const command = process.argv[2];

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Database connection established.\n");

    switch (command) {
      case "up":
        console.log("Running pending migrations...\n");
        const upResult = await umzug.up();
        if (upResult.length === 0) {
          console.log("No pending migrations.");
        } else {
          console.log(`\nApplied ${upResult.length} migration(s):`);
          upResult.forEach((m) => console.log(`  - ${m.name}`));
        }
        break;

      case "down":
        console.log("Reverting last migration...\n");
        const downResult = await umzug.down();
        if (downResult.length === 0) {
          console.log("No migrations to revert.");
        } else {
          console.log(`\nReverted ${downResult.length} migration(s):`);
          downResult.forEach((m) => console.log(`  - ${m.name}`));
        }
        break;

      case "down:all":
        console.log("Reverting all migrations...\n");
        const downAllResult = await umzug.down({ to: 0 });
        if (downAllResult.length === 0) {
          console.log("No migrations to revert.");
        } else {
          console.log(`\nReverted ${downAllResult.length} migration(s):`);
          downAllResult.forEach((m) => console.log(`  - ${m.name}`));
        }
        break;

      case "status":
        const pending = await umzug.pending();
        const executed = await umzug.executed();
        console.log(`Executed migrations (${executed.length}):`);
        executed.forEach((m) => console.log(`  - ${m.name}`));
        console.log(`\nPending migrations (${pending.length}):`);
        pending.forEach((m) => console.log(`  - ${m.name}`));
        break;

      default:
        console.log("Usage: node src/migrate.js <command>\n");
        console.log("Commands:");
        console.log("  up        Run all pending migrations");
        console.log("  down      Revert the last migration");
        console.log("  down:all  Revert all migrations");
        console.log("  status    Show executed and pending migrations");
        break;
    }
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
