import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const SettlementLedger = sequelize.define(
  "SettlementLedger",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    user_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    account_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    type: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    wallet_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
      unique: true,
    },
    currency_code: {
      type: DataTypes.CHAR(5),
      allowNull: true,
    },
    identifier: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    ip_address: {
      type: DataTypes.CHAR(39),
      allowNull: true,
    },
    session_id: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    date_created: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    date_modified: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "SettlementLedgers",
    timestamps: false,
  }
);

export default SettlementLedger;
