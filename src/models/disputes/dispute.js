import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const TransactionDispute = sequelize.define(
  "TransactionDispute",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_key: { type: DataTypes.CHAR(30) },
    account_key: { type: DataTypes.CHAR(30) },
    transaction_wallet_key: { type: DataTypes.CHAR(30) },
    settlement_wallet_key: { type: DataTypes.CHAR(30) },
    transaction_reference: { type: DataTypes.CHAR(250), unique: true },
    dispute_reference: { type: DataTypes.CHAR(250), unique: true },
    settlement_reference: { type: DataTypes.CHAR(250), unique: true },
    settlement_status: { type: DataTypes.CHAR(10) },
    status: { type: DataTypes.CHAR(10) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "TransactionDisputes", timestamps: false }
);

export default TransactionDispute;
