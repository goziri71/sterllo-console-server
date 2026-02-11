import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";


const User = sequelize.define(
  "User",
  {
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
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    first_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    last_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    date_created: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
      field: "date_created",
    },
    date_modified: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "date_modified",
    },
  },
  {
    tableName: "Users",
    timestamps: false,
  }
);

export default User;
