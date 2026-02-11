import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const WhitelistedIP = sequelize.define(
  "WhitelistedIP",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_key: { type: DataTypes.CHAR(30) },
    account_key: { type: DataTypes.CHAR(30) },
    user_client_key: { type: DataTypes.CHAR(100) },
    account_client_key: { type: DataTypes.CHAR(100) },
    ip_addresses: { type: DataTypes.TEXT },
    identifier: { type: DataTypes.CHAR(250), unique: true },
    is_enabled: { type: DataTypes.CHAR(1) },
    ip_address: { type: DataTypes.CHAR(39) },
    session_id: { type: DataTypes.CHAR(30) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "WhitelistedIPAddresses", timestamps: false }
);

export default WhitelistedIP;
