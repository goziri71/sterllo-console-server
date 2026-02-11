import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const KYC = sequelize.define(
  "KYC",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    user_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    account_key: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    identifier: {
      type: DataTypes.CHAR(250),
      allowNull: true,
    },
    identification_type: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    identification_number: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    issued_date: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    expiry_date: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    is_compliant: {
      type: DataTypes.CHAR(1),
      allowNull: true,
    },
    reference: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    source: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.CHAR(39),
      allowNull: true,
    },
    date_created: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    date_modified: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "KYCs",
    timestamps: false,
  }
);

export default KYC;
