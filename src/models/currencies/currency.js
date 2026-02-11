import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Currency = sequelize.define(
  "Currency",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.CHAR(100) },
    code: { type: DataTypes.CHAR(5), unique: true },
    symbol: { type: DataTypes.CHAR(5) },
    category: { type: DataTypes.CHAR(10) },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "Currencies", timestamps: false }
);

export default Currency;
