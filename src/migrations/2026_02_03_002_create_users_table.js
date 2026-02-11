import { DataTypes } from "sequelize";

/**
 * Migration: Create Users table
 * Creates the Users table with all necessary fields
 */

export async function up({ context: queryInterface }) {
  await queryInterface.createTable("Users", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    user_key: {
      type: DataTypes.STRING(600),
      allowNull: true,
      unique: true,
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    },
    first_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    },
    last_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    },
    date_created: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    date_modified: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  // Add index for user_key (unique constraint is already created above)
  console.log("Users table created successfully");
}

export async function down({ context: queryInterface }) {
  await queryInterface.dropTable("Users");
  console.log("Users table dropped successfully");
}
