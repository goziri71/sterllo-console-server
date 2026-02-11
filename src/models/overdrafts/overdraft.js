import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const OverdraftRequest = sequelize.define(
  "OverdraftRequest",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_key: { type: DataTypes.CHAR(30) },
    account_key: { type: DataTypes.CHAR(30) },
    source_wallet_key: { type: DataTypes.CHAR(30) },
    target_wallet_key: { type: DataTypes.CHAR(30) },
    amount: { type: DataTypes.STRING(250) },
    charge_type: { type: DataTypes.CHAR(50) },
    charge_value: { type: DataTypes.STRING(250) },
    charge_cap: { type: DataTypes.STRING(250) },
    contract_code: { type: DataTypes.CHAR(20), unique: true },
    start_date: { type: DataTypes.DATE },
    end_date: { type: DataTypes.DATE },
    reference: { type: DataTypes.CHAR(250), unique: true },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    processing_fee_amount: { type: DataTypes.STRING(250) },
    processing_vat_amount: { type: DataTypes.STRING(250) },
    processing_fee_reference: { type: DataTypes.CHAR(250), unique: true },
    processing_fee_status: { type: DataTypes.CHAR(20) },
    processing_fee_date: { type: DataTypes.DATE },
    status: { type: DataTypes.CHAR(20) },
    source: { type: DataTypes.CHAR(50) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "OverdraftRequests", timestamps: false }
);

export default OverdraftRequest;
