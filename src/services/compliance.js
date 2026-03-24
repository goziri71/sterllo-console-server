import { and, count, desc, eq, gte, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { customers } from "../db/schema/customers.js";
import { kycs } from "../db/schema/kycs.js";
import { transactionDisputes } from "../db/schema/disputes.js";
import { ErrorClass } from "../utils/errorClass/index.js";

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function parseDate(value, field) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ErrorClass(`Invalid ${field}`, 400);
  }
  return parsed;
}

function normalizeAlertStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["resolved", "closed", "compliant", "approved"].includes(normalized)) return "archived";
  return "active";
}

function normalizeDisputeSeverity(status) {
  const normalized = String(status || "").toLowerCase();
  if (["escalated", "failed", "rejected"].includes(normalized)) return "high";
  if (["in_review", "pending", "processing"].includes(normalized)) return "medium";
  return "low";
}

function withinRange(dateValue, fromDate, toDate) {
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return false;
  if (fromDate && dt < fromDate) return false;
  if (toDate && dt > toDate) return false;
  return true;
}

function toWeekKey(dateValue) {
  const dt = new Date(dateValue);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
}

export default class ComplianceService {
  async getOverview({ from_date, to_date }) {
    const fromDate = parseDate(from_date, "from_date");
    const toDate = parseDate(to_date, "to_date");
    const thisMonth = startOfMonth();

    const rangeConditions = [];
    if (fromDate) rangeConditions.push(gte(customers.date_created, fromDate));
    if (toDate) rangeConditions.push(sql`${customers.date_created} <= ${toDate}`);

    const customerDateWhere = rangeConditions.length ? and(...rangeConditions) : undefined;

    const [
      [{ total: flaggedAccounts }],
      [{ total: restrictedAccounts }],
      [{ total: pendingKycReviews }],
      [{ total: openDisputes }],
      [{ total: reportsGeneratedThisMonth }],
      verifiedRows,
    ] = await Promise.all([
      db.select({ total: count() })
        .from(customers)
        .where(or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y"))),
      db.select({ total: count() })
        .from(customers)
        .where(ne(customers.status, "ACTIVE")),
      db.select({ total: count() })
        .from(kycs)
        .where(ne(kycs.is_compliant, "Y")),
      db.select({ total: count() })
        .from(transactionDisputes)
        .where(sql`LOWER(COALESCE(${transactionDisputes.status}, '')) NOT IN ('resolved', 'closed')`),
      db.select({ total: count() })
        .from(kycs)
        .where(gte(kycs.date_created, thisMonth)),
      db.execute(sql`
        SELECT COUNT(DISTINCT identifier) AS total
        FROM KYCs
        WHERE is_compliant = 'Y'
      `),
    ]);

    const verifiedCustomers = Number((verifiedRows?.[0]?.total ?? verifiedRows?.[0]?.[0]?.total) || 0);

    return {
      cards: {
        verified_customers: verifiedCustomers,
        pending_kyc_reviews: Number(pendingKycReviews || 0),
        flagged_accounts: Number(flaggedAccounts || 0),
        restricted_accounts: Number(restrictedAccounts || 0),
      },
      operational_monitoring: {
        investigations_in_progress: Number(openDisputes || 0),
        open_compliance_alerts: Number(pendingKycReviews || 0) + Number(openDisputes || 0),
        reports_generated_this_month: Number(reportsGeneratedThisMonth || 0),
      },
      filters: {
        from_date: fromDate,
        to_date: toDate,
        has_date_scope: Boolean(customerDateWhere),
      },
    };
  }

  async getVerificationStatus() {
    const tierRows = await db
      .select({
        tier: customers.tier,
        total: count(),
      })
      .from(customers)
      .groupBy(customers.tier)
      .orderBy(customers.tier);

    const tierMap = new Map();
    for (const row of tierRows) {
      tierMap.set(Number(row.tier || 0), Number(row.total || 0));
    }

    const tiers = [0, 1, 2, 3, 4].map((tier) => ({
      tier,
      total_customers: tierMap.get(tier) || 0,
    }));

    return { tiers };
  }

  async getRiskTrends({ from_date, to_date }) {
    const now = new Date();
    const fromDate = parseDate(from_date, "from_date") || startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21));
    const toDate = parseDate(to_date, "to_date") || now;

    const [flaggedRows, disputeRows] = await Promise.all([
      db.select({
        date_created: customers.date_created,
      })
        .from(customers)
        .where(
          and(
            or(eq(customers.is_pnd, "Y"), eq(customers.is_pnc, "Y")),
            gte(customers.date_created, fromDate),
            sql`${customers.date_created} <= ${toDate}`,
          ),
        ),
      db.select({
        status: transactionDisputes.status,
        date_created: transactionDisputes.date_created,
        date_modified: transactionDisputes.date_modified,
      })
        .from(transactionDisputes)
        .where(
          and(
            gte(transactionDisputes.date_created, fromDate),
            sql`${transactionDisputes.date_created} <= ${toDate}`,
          ),
        ),
    ]);

    const bucket = new Map();
    function ensure(key) {
      if (!bucket.has(key)) {
        bucket.set(key, {
          period_key: key,
          transactions_flagged: 0,
          investigations_opened: 0,
          alerts_solved: 0,
        });
      }
      return bucket.get(key);
    }

    for (const row of flaggedRows) {
      if (!withinRange(row.date_created, fromDate, toDate)) continue;
      const key = toWeekKey(row.date_created);
      if (!key) continue;
      ensure(key).transactions_flagged += 1;
    }

    for (const row of disputeRows) {
      if (withinRange(row.date_created, fromDate, toDate)) {
        const key = toWeekKey(row.date_created);
        if (key) ensure(key).investigations_opened += 1;
      }
      const status = String(row.status || "").toLowerCase();
      if (["resolved", "closed"].includes(status) && withinRange(row.date_modified, fromDate, toDate)) {
        const key = toWeekKey(row.date_modified);
        if (key) ensure(key).alerts_solved += 1;
      }
    }

    const points = [...bucket.values()].sort((a, b) => new Date(a.period_key) - new Date(b.period_key));
    return {
      from_date: fromDate,
      to_date: toDate,
      points,
    };
  }

  async getAlerts({ limit, offset, filters }) {
    const fromDate = parseDate(filters.from_date, "from_date");
    const toDate = parseDate(filters.to_date, "to_date");
    const typeFilter = String(filters.type || "").toLowerCase();
    const statusFilter = String(filters.status || "active").toLowerCase();
    const search = String(filters.search || "").trim().toLowerCase();
    const severityFilter = String(filters.severity || "").toLowerCase();

    const wantsKyc = !typeFilter || typeFilter === "kyc";
    const wantsDispute = !typeFilter || typeFilter === "dispute";

    const [kycRows, disputeRows] = await Promise.all([
      wantsKyc
        ? db.select({
          reference: kycs.reference,
          identifier: kycs.identifier,
          account_key: kycs.account_key,
          user_key: kycs.user_key,
          identification_type: kycs.identification_type,
          is_compliant: kycs.is_compliant,
          date_created: kycs.date_created,
          date_modified: kycs.date_modified,
        })
          .from(kycs)
          .orderBy(desc(kycs.date_created))
          .limit(500)
        : Promise.resolve([]),
      wantsDispute
        ? db.select({
          reference: transactionDisputes.dispute_reference,
          account_key: transactionDisputes.account_key,
          user_key: transactionDisputes.user_key,
          status: transactionDisputes.status,
          date_created: transactionDisputes.date_created,
          date_modified: transactionDisputes.date_modified,
        })
          .from(transactionDisputes)
          .orderBy(desc(transactionDisputes.date_created))
          .limit(500)
        : Promise.resolve([]),
    ]);

    const kycAlerts = kycRows.map((k) => {
      const normalizedStatus = k.is_compliant === "Y" ? "archived" : "active";
      return {
        alert_id: `KYC:${k.reference}`,
        alert_type: "kyc",
        severity: "medium",
        status: normalizedStatus,
        title: "Pending KYC review",
        description: `KYC ${k.identification_type || "document"} requires review`,
        reference: k.reference,
        account_key: k.account_key,
        user_key: k.user_key,
        identifier: k.identifier,
        created_at: k.date_created,
        updated_at: k.date_modified || k.date_created,
      };
    });

    const disputeAlerts = disputeRows.map((d) => {
      const normalizedStatus = normalizeAlertStatus(d.status);
      return {
        alert_id: `DISPUTE:${d.reference}`,
        alert_type: "dispute",
        severity: normalizeDisputeSeverity(d.status),
        status: normalizedStatus,
        title: normalizedStatus === "archived" ? "Dispute resolved" : "Dispute investigation",
        description: `Dispute ${d.reference} is ${String(d.status || "pending").toLowerCase()}`,
        reference: d.reference,
        account_key: d.account_key,
        user_key: d.user_key,
        created_at: d.date_created,
        updated_at: d.date_modified || d.date_created,
      };
    });

    let alerts = [...kycAlerts, ...disputeAlerts];

    alerts = alerts.filter((alert) => {
      if (statusFilter && statusFilter !== "all" && alert.status !== statusFilter) return false;
      if (severityFilter && alert.severity !== severityFilter) return false;
      if (!withinRange(alert.created_at, fromDate, toDate)) return false;
      if (search) {
        const haystack = `${alert.title} ${alert.description} ${alert.reference} ${alert.account_key || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = alerts.length;
    const rows = alerts.slice(offset, offset + limit);

    return { count: total, rows };
  }

  async getActivity({ limit, offset }) {
    const { rows, count: total } = await this.getAlerts({
      limit: Math.min(limit + offset, 100),
      offset: 0,
      filters: { status: "all" },
    });

    const activities = rows.map((row) => ({
      type: row.alert_type,
      description: row.description,
      reference: row.reference,
      timestamp: row.updated_at || row.created_at,
      severity: row.severity,
      status: row.status,
    }));

    return {
      count: total,
      rows: activities.slice(offset, offset + limit),
    };
  }

  async getReports({ limit, offset }) {
    const monthStart = startOfMonth();
    const [reportRows, [{ totalResolvedDisputes }], [{ totalPendingKycs }]] = await Promise.all([
      db.execute(sql`
        SELECT DATE_FORMAT(date_created, '%Y-%m') AS month_key, COUNT(*) AS total_kycs
        FROM KYCs
        GROUP BY DATE_FORMAT(date_created, '%Y-%m')
        ORDER BY month_key DESC
        LIMIT 12
      `),
      db.select({ totalResolvedDisputes: count() })
        .from(transactionDisputes)
        .where(
          and(
            sql`LOWER(COALESCE(${transactionDisputes.status}, '')) IN ('resolved', 'closed')`,
            gte(transactionDisputes.date_modified, monthStart),
          ),
        ),
      db.select({ totalPendingKycs: count() })
        .from(kycs)
        .where(ne(kycs.is_compliant, "Y")),
    ]);

    const monthlyRows = (reportRows?.[0] || reportRows || []).map((row) => ({
      report_id: `COMPLIANCE-${row.month_key}`,
      type: "monthly_compliance_summary",
      status: "ready",
      month: row.month_key,
      generated_at: new Date(`${row.month_key}-01T00:00:00Z`),
      total_items: Number(row.total_kycs || 0),
    }));

    const currentMonth = {
      report_id: "COMPLIANCE-CURRENT",
      type: "current_compliance_snapshot",
      status: "ready",
      month: monthStart.toISOString().slice(0, 7),
      generated_at: new Date(),
      total_items: Number(totalResolvedDisputes || 0) + Number(totalPendingKycs || 0),
    };

    const reports = [currentMonth, ...monthlyRows];
    const total = reports.length;
    const rows = reports.slice(offset, offset + limit);
    return { count: total, rows };
  }
}
