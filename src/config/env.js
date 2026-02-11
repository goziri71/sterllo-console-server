import dotenv from "dotenv";

dotenv.config();

export const env = {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,

    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_HOST: process.env.DB_HOST || "localhost",
    DB_PORT: process.env.DB_PORT || 5432,
    DB_DIALECT: process.env.DB_DIALECT || "mysql",

    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",
}