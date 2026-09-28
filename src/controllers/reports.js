import ReportsService from "../services/reports.js";
import { extractReportFilters } from "../utils/reportFilters.js";
import { csvFilename, rowsToCsv, sendCsvReply } from "../utils/csvExport.js";
import { userCanReadFinancial, redactFinancialDeep } from "../utils/financialAccess.js";

const reportsService = new ReportsService();

function maybeRedact(request, payload) {
  if (userCanReadFinancial(request.user)) return payload;
  if (payload.rows) {
    return {
      ...payload,
      rows: payload.rows.map((row) => redactFinancialDeep(row)),
      summary: payload.summary ? redactFinancialDeep(payload.summary) : payload.summary,
    };
  }
  return redactFinancialDeep(payload);
}

async function handleReport(request, reply, loader, reportKey) {
  const filters = extractReportFilters(request.query);
  const raw = await loader(filters);
  const payload = maybeRedact(request, raw);

  if (filters.format === "csv") {
    const csv = rowsToCsv(payload.rows || []);
    return sendCsvReply(reply, {
      filename: csvFilename(reportKey, filters.from_date, filters.to_date),
      csv,
    });
  }

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Report generated successfully",
    data: payload,
  });
}

export const getSettlementReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.settlementReport(f), "settlements");

export const getTransactionReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.transactionReport(f), "transactions");

export const getDepositReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.depositReport(f), "deposits");

export const getTransferReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.transferReport(f), "transfers");

export const getCustomerBalancesReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.customerBalancesReport(f), "customer_balances");

export const getOpeningClosingReport = (request, reply) =>
  handleReport(
    request,
    reply,
    (f) => reportsService.openingClosingReport(f),
    "opening_closing_balances",
  );

export const getBalanceSnapshotReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.balanceSnapshotReport(f), "balance_snapshot");

export const getVatReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.vatReport(f), "vat");

export const getVendorsReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.vendorsReport(f), "vendors");

export const getRevenueReport = (request, reply) =>
  handleReport(request, reply, (f) => reportsService.revenueReport(f), "revenue");

export const getGrowthRevenueByMerchant = (request, reply) =>
  handleReport(
    request,
    reply,
    (f) => reportsService.growthRevenueByMerchant(f),
    "growth_revenue_by_merchant",
  );

export const getGrowthCustomerExport = (request, reply) =>
  handleReport(
    request,
    reply,
    (f) => reportsService.growthCustomerExport(f),
    "growth_customers",
  );
