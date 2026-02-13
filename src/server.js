import app from "../app.js";
import { env } from "./config/env.js";
import sequelize from "./config/database.js";
import { setApp } from "./utils/jwt/index.js";

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection established successfully");

    // Make Fastify instance available to JWT utility after plugins are loaded
    await app.ready();
    setApp(app);

    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);

    process.on("SIGTERM", () => {
      console.log("SIGTERM signal received: shutting down gracefully");
      app.close().then(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
};

startServer();
