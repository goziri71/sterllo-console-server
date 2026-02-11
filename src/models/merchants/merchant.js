import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Merchant = sequelize.define(
  "Merchant",
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
    name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    trade_name: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    wallet_identifier: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    ledger_identifier: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    default_kyc_tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    session_id: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.CHAR(39),
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
    tableName: "Merchants",
    timestamps: false,
  }
);

export default Merchant;
