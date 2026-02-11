import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const NGNDeposit = sequelize.define(
  "NGNDeposit",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    wallet_key: { type: DataTypes.CHAR(30) },
    recipient_account_number: { type: DataTypes.CHAR(10) },
    sender_bank_name: { type: DataTypes.CHAR(100) },
    sender_account_name: { type: DataTypes.CHAR(100) },
    sender_account_number: { type: DataTypes.CHAR(10) },
    amount: { type: DataTypes.STRING(250) },
    charge: { type: DataTypes.STRING(250) },
    vat: { type: DataTypes.STRING(250) },
    vat_included: { type: DataTypes.CHAR(1) },
    stamp_duty: { type: DataTypes.STRING(250) },
    settlement: { type: DataTypes.STRING(250) },
    deposit_reference: { type: DataTypes.CHAR(250), unique: true },
    stamp_duty_reference: { type: DataTypes.CHAR(250), unique: true },
    stamp_duty_status: { type: DataTypes.CHAR(20) },
    stamp_duty_response: { type: DataTypes.TEXT },
    credit_status: { type: DataTypes.CHAR(20) },
    opening_balance: { type: DataTypes.STRING(250) },
    closing_balance: { type: DataTypes.STRING(250) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "NGNDeposits", timestamps: false }
);

export default NGNDeposit;
