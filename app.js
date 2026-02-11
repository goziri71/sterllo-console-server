import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import healthRoutes from "./src/routes/health/routes.js";
import authRoutes from "./src/routes/auth/routes.js";
import merchantRoutes from "./src/routes/merchants/routes.js";
import customerRoutes from "./src/routes/customers/routes.js";
import kycRoutes from "./src/routes/kycs/routes.js";
import transactionRoutes from "./src/routes/transactions/routes.js";
import disputeRoutes from "./src/routes/disputes/routes.js";
import overdraftRoutes from "./src/routes/overdrafts/routes.js";
import configRoutes from "./src/routes/config/routes.js";
import errorHandler from "./src/middleware/errorHandler.js";

const app = express();


app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

app.use(morgan("dev"));

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/merchants", merchantRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/kycs", kycRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/disputes", disputeRoutes);
app.use("/api/v1/overdrafts", overdraftRoutes);
app.use("/api/v1/config", configRoutes);


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});


app.use(errorHandler);






export default app;
