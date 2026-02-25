import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./src/config/env.js";
import { api } from "./src/services/centralizedversion.js";

import healthRoutes from "./src/routes/health/routes.js";
import authRoutes from "./src/routes/auth/routes.js";
import merchantRoutes from "./src/routes/merchants/routes.js";
import customerRoutes from "./src/routes/customers/routes.js";
import kycRoutes from "./src/routes/kycs/routes.js";
import transactionRoutes from "./src/routes/transactions/routes.js";
import disputeRoutes from "./src/routes/disputes/routes.js";
import overdraftRoutes from "./src/routes/overdrafts/routes.js";
import configRoutes from "./src/routes/config/routes.js";
import feeRoutes from "./src/routes/fees/routes.js";
import dashboardRoutes from "./src/routes/dashboard/routes.js";
import walletsRoutes from "./src/routes/wallets/routes.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const isProduction = process.env.NODE_ENV === "production";

const app = Fastify({
  logger: isProduction
    ? true
    : {
        transport: {
          target: "pino-pretty",
        },
      },
  trustProxy: true,
});

// Global error handler (must be set before route registration)
app.setErrorHandler(errorHandler);

// 404 handler
app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    success: false,
    message: "Route not found",
  });
});

// Plugins
app.register(fjwt, {
  secret: env.JWT_SECRET,
  sign: { expiresIn: env.JWT_EXPIRES_IN },
});
app.register(helmet);
app.register(cors);
app.register(rateLimit, {
  max: 100,
  timeWindow: "15 minutes",
});



// Routes
app.register(healthRoutes, { prefix: api("/health") });
app.register(authRoutes, { prefix: api("/auth") });
app.register(merchantRoutes, { prefix: api("/merchants") });
app.register(customerRoutes, { prefix: api("/customers") });
app.register(kycRoutes, { prefix: api("/kycs") });
app.register(transactionRoutes, { prefix: api("/transactions") });
app.register(disputeRoutes, { prefix: api("/disputes") });
app.register(overdraftRoutes, { prefix: api("/overdrafts") });
app.register(configRoutes, { prefix: api("/config") });
app.register(feeRoutes, { prefix: api("/fees") });
app.register(dashboardRoutes, { prefix: api("/dashboard") });
app.register(walletsRoutes, { prefix: api("/wallets") });

export default app;
