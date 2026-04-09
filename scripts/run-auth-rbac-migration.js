#!/usr/bin/env node
/**
 * Run RBAC migration on the auth DB and assign management to the bootstrap email.
 *
 * Usage:
 *   npm run migrate:auth-rbac
 *   BOOTSTRAP_MANAGEMENT_EMAIL=other@example.com npm run migrate:auth-rbac
 */
import { runAuthRbacMigration } from "../src/db/runAuthRbacMigration.js";

runAuthRbacMigration()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.warning) {
      console.warn("Warning:", result.warning);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
