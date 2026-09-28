import {
  getBalanceSnapshotReport,
  getCustomerBalancesReport,
  getDepositReport,
  getGrowthCustomerExport,
  getGrowthRevenueByMerchant,
  getOpeningClosingReport,
  getRevenueReport,
  getSettlementReport,
  getTransactionReport,
  getTransferReport,
  getVatReport,
  getVendorsReport,
} from "../../controllers/reports.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function reportsRoutes(fastify) {
  fastify.addHook("preHandler", authenticate);

  const financial = requirePermission(PERMISSIONS.FINANCIAL_READ);
  const consoleRead = requirePermission(PERMISSIONS.CONSOLE_READ);

  fastify.get("/settlements", { preHandler: financial }, getSettlementReport);
  fastify.get("/transactions", { preHandler: financial }, getTransactionReport);
  fastify.get("/deposits", { preHandler: financial }, getDepositReport);
  fastify.get("/transfers", { preHandler: financial }, getTransferReport);
  fastify.get("/customer-balances", { preHandler: financial }, getCustomerBalancesReport);
  fastify.get("/opening-closing-balances", { preHandler: financial }, getOpeningClosingReport);
  fastify.get("/balance-snapshot", { preHandler: financial }, getBalanceSnapshotReport);
  fastify.get("/vat", { preHandler: financial }, getVatReport);
  fastify.get("/vendors", { preHandler: financial }, getVendorsReport);
  fastify.get("/revenue", { preHandler: financial }, getRevenueReport);

  fastify.get("/growth/revenue-by-merchant", { preHandler: financial }, getGrowthRevenueByMerchant);
  fastify.get("/growth/customers", { preHandler: consoleRead }, getGrowthCustomerExport);
}
