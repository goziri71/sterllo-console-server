import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const MerchantLedger = sequelize.define(
  "MerchantLedger",
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
    environment: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    wallet_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
      unique: true,
    },
    wallet_id: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    charge_ledger_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
      unique: true,
    },
    vat_ledger_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
      unique: true,
    },
    reference: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    currency_code: {
      type: DataTypes.CHAR(5),
      allowNull: true,
    },
    source: {
      type: DataTypes.CHAR(50),
      allowNull: true,
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
  },
  {
    tableName: "MerchantLedgers",
    timestamps: false,
  }
);

export default MerchantLedger;
