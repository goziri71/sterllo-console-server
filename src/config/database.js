import { Sequelize } from "sequelize";
import { env } from "./env.js";

const sequelize = new Sequelize({
  database: env.DB_NAME,
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: env.DB_DIALECT,
  logging: env.NODE_ENV === "development" ? console.log : false,
});

export default sequelize;
