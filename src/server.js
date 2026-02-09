import app from "../app.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode` + "🚀");
})


/*shutdown server*/

process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: shutting down gracefully");
    server.close(() => {
        process.exit(0)
    })
})