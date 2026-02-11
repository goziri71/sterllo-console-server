import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const VAT = sequelize.define(
  "VAT",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    identifier: { type: DataTypes.CHAR(250), unique: true },
    country_code: { type: DataTypes.CHAR(3), unique: true },
    percentage: { type: DataTypes.DOUBLE },
    date_created: { type: DataTypes.DATE },
    date_modified: { type: DataTypes.DATE },
  },
  { tableName: "VATs", timestamps: false }
);

export default VAT;
