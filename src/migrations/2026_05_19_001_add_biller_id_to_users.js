import { DataTypes } from "sequelize";

/**
 * Migration: Add biller_id to Users table (crosslink login matching)
 */

export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("Users", "biller_id", {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    after: "email",
  });

  console.log("biller_id added to Users table successfully");
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("Users", "biller_id");
  console.log("biller_id removed from Users table successfully");
}
