import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const NGNPayout = sequelize.define(
  "NGNPayout",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_key: { type: DataTypes.CHAR(30) },
    account_key: { type: DataTypes.CHAR(30) },
    source_identifier: { type: DataTypes.CHAR(250) },
    source_wallet_key: { type: DataTypes.CHAR(30) },
    source_account_name: { type: DataTypes.CHAR(100) },
    source_account_number: { type: DataTypes.CHAR(10) },
    recipient_account_number: { type: DataTypes.CHAR(10) },
    recipient_account_name: { type: DataTypes.CHAR(100) },
    recipient_institution_name: { type: DataTypes.CHAR(100) },
    recipient_institution_identifier: { type: DataTypes.CHAR(250) },
    amount: { type: DataTypes.STRING(250) },
    charge: { type: DataTypes.STRING(250) },
    custom_charge: { type: DataTypes.STRING(250) },
    vat: { type: DataTypes.STRING(250) },
    vat_included: { type: DataTypes.CHAR(1) },
    narration: { type: DataTypes.CHAR(250) },
    live_reference: { type: DataTypes.CHAR(250), unique: true },
    isvs_reference: { type: DataTypes.CHAR(250), unique: true },
    reversal_reference: { type: DataTypes.CHAR(250), unique: true },
    vendor_reference: { type: DataTypes.CHAR(250), unique: true },
    vendor: { type: DataTypes.CHAR(50) },
    debit_status: { type: DataTypes.CHAR(20) },
    opening_balance: { type: DataTypes.STRING(250) },
    closing_balance: { type: DataTypes.STRING(250) },
    payout_status: { type: DataTypes.CHAR(20) },
    payout_response: { type: DataTypes.TEXT },
    tsq_response: { type: DataTypes.TEXT },
    source: { type: DataTypes.CHAR(50) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_reversed: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "NGNPayouts", timestamps: false }
);

export default NGNPayout;
