import { DataTypes } from "sequelize";

/**
 * Migration: Add auth fields to Users table
 * Merges authentication fields into the Users table
 */

export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("Users", "email", {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    after: "user_key",
  });

  await queryInterface.addColumn("Users", "password", {
    type: DataTypes.STRING(255),
    allowNull: false,
    after: "email",
  });

  await queryInterface.addColumn("Users", "last_login", {
    type: DataTypes.DATE,
    allowNull: true,
    after: "role",
  });

  console.log("Auth fields added to Users table successfully");
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("Users", "email");
  await queryInterface.removeColumn("Users", "password");
  await queryInterface.removeColumn("Users", "last_login");

  console.log("Auth fields removed from Users table successfully");
}
