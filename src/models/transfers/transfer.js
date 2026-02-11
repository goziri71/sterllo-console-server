import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Transfer = sequelize.define(
  "Transfer",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_key: { type: DataTypes.CHAR(30) },
    account_key: { type: DataTypes.CHAR(30) },
    source_identifier: { type: DataTypes.CHAR(250) },
    target_identifier: { type: DataTypes.CHAR(250) },
    source_wallet_key: { type: DataTypes.CHAR(30) },
    target_wallet_key: { type: DataTypes.CHAR(30) },
    currency_code: { type: DataTypes.CHAR(5) },
    amount: { type: DataTypes.STRING(250) },
    source_charge: { type: DataTypes.STRING(250) },
    custom_source_charge: { type: DataTypes.STRING(250) },
    target_charge: { type: DataTypes.STRING(250) },
    custom_target_charge: { type: DataTypes.STRING(250) },
    source_vat: { type: DataTypes.STRING(250) },
    source_vat_included: { type: DataTypes.CHAR(1) },
    target_vat: { type: DataTypes.STRING(250) },
    target_vat_included: { type: DataTypes.CHAR(1) },
    status: { type: DataTypes.CHAR(20) },
    message: { type: DataTypes.TEXT },
    source_reference: { type: DataTypes.CHAR(250), unique: true },
    target_reference: { type: DataTypes.CHAR(250), unique: true },
    reversal_reference: { type: DataTypes.CHAR(250), unique: true },
    source_opening_balance: { type: DataTypes.STRING(250) },
    source_closing_balance: { type: DataTypes.STRING(250) },
    target_opening_balance: { type: DataTypes.STRING(250) },
    target_closing_balance: { type: DataTypes.STRING(250) },
    source: { type: DataTypes.CHAR(50) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_reversed: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "Transfers", timestamps: false }
);

export default Transfer;
