import app from "../app.js";
import { env } from "./config/env.js";
import sequelize from "./config/database.js";

const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log("Database connection established successfully ✅");

        const server = app.listen(env.PORT, () => {
            console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode 🚀`);
        });

        process.on("SIGTERM", () => {
            console.log("SIGTERM signal received: shutting down gracefully");
            server.close(() => {
                process.exit(0);
            });
        });
    } catch (error) {
        console.error("Unable to connect to the database:", error.message);
        process.exit(1);
    }
};

startServer();