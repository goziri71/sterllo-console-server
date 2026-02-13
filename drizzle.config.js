import "dotenv/config";

export default {
  schema: "./src/db/schema/index.js",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
};
