import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Customer = sequelize.define(
  "Customer",
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
      unique: true,
    },
    parent_identifier: {
      type: DataTypes.CHAR(250),
      allowNull: true,
    },
    parent_reference: {
      type: DataTypes.CHAR(250),
      allowNull: true,
    },
    reference: {
      type: DataTypes.CHAR(250),
      allowNull: true,
      unique: true,
    },
    environment: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    type: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    country_name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    country_code: {
      type: DataTypes.CHAR(3),
      allowNull: true,
    },
    currency_code: {
      type: DataTypes.CHAR(5),
      allowNull: true,
    },
    first_name: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    middle_name: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    surname: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    phone_number: {
      type: DataTypes.CHAR(30),
      allowNull: true,
    },
    email_address: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    date_of_birth: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    nationality: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    nationality_code: {
      type: DataTypes.CHAR(3),
      allowNull: true,
    },
    business_name: {
      type: DataTypes.CHAR(100),
      allowNull: true,
    },
    business_registration_number: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    state: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    city: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tier: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    is_personal_compliant: {
      type: DataTypes.CHAR(1),
      allowNull: true,
    },
    is_business_compliant: {
      type: DataTypes.CHAR(1),
      allowNull: true,
    },
    is_pnd: {
      type: DataTypes.CHAR(1),
      allowNull: true,
    },
    is_pnc: {
      type: DataTypes.CHAR(1),
      allowNull: true,
    },
    status: {
      type: DataTypes.CHAR(10),
      allowNull: true,
    },
    source: {
      type: DataTypes.CHAR(50),
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.CHAR(39),
      allowNull: true,
    },
    session_id: {
      type: DataTypes.CHAR(30),
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
    tableName: "Customers",
    timestamps: false,
  }
);

export default Customer;
