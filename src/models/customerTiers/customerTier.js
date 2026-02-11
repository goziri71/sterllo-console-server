import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const CustomerTier = sequelize.define(
  "CustomerTier",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tier: { type: DataTypes.INTEGER },
    country_code: { type: DataTypes.CHAR(3) },
    currency_code: { type: DataTypes.CHAR(5) },
    min_balance: { type: DataTypes.DOUBLE },
    max_balance: { type: DataTypes.DOUBLE },
    min_credit: { type: DataTypes.DOUBLE },
    max_credit: { type: DataTypes.DOUBLE },
    daily_credit_value_limit: { type: DataTypes.DOUBLE },
    daily_credit_volume_limit: { type: DataTypes.INTEGER },
    weekly_credit_value_limit: { type: DataTypes.DOUBLE },
    weekly_credit_volume_limit: { type: DataTypes.INTEGER },
    monthly_credit_value_limit: { type: DataTypes.DOUBLE },
    monthly_credit_volume_limit: { type: DataTypes.INTEGER },
    min_debit: { type: DataTypes.DOUBLE },
    max_debit: { type: DataTypes.DOUBLE },
    daily_debit_value_limit: { type: DataTypes.DOUBLE },
    daily_debit_volume_limit: { type: DataTypes.INTEGER },
    weekly_debit_value_limit: { type: DataTypes.DOUBLE },
    weekly_debit_volume_limit: { type: DataTypes.INTEGER },
    monthly_debit_value_limit: { type: DataTypes.DOUBLE },
    monthly_debit_volume_limit: { type: DataTypes.INTEGER },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "CustomerTiers", timestamps: false }
);

export default CustomerTier;
