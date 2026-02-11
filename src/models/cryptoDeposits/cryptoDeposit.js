import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const CryptoDeposit = sequelize.define(
  "CryptoDeposit",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    wallet_key: { type: DataTypes.CHAR(30) },
    recipient_address: { type: DataTypes.CHAR(250) },
    sender_address: { type: DataTypes.CHAR(250) },
    amount: { type: DataTypes.STRING(250) },
    charge: { type: DataTypes.STRING(250) },
    vat: { type: DataTypes.STRING(250) },
    vat_included: { type: DataTypes.CHAR(1) },
    settlement: { type: DataTypes.STRING(250) },
    hash: { type: DataTypes.CHAR(250), unique: true },
    deposit_reference: { type: DataTypes.CHAR(250), unique: true },
    credit_status: { type: DataTypes.CHAR(20) },
    opening_balance: { type: DataTypes.STRING(250) },
    closing_balance: { type: DataTypes.STRING(250) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "CryptocurrencyDeposits", timestamps: false }
);

export default CryptoDeposit;
