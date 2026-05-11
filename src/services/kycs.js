import { eq, and, desc, count, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { kycs } from "../db/schema/kycs.js";
import { customers } from "../db/schema/customers.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const KYC_IDENTIFICATION_TYPE_LABELS = {
  BANK_VERIFICATION_NUMBER: "Bank Verification Number (BVN)",
  BVN: "Bank Verification Number (BVN)",
  NATIONAL_ID: "National ID",
  DRIVERS_LICENSE: "Driver's License",
  INTERNATIONAL_PASSPORT: "International Passport",
  VOTERS_CARD: "Voter's Card",
};

function labelForIdentificationType(code) {
  if (!code) return null;
  if (KYC_IDENTIFICATION_TYPE_LABELS[code]) return KYC_IDENTIFICATION_TYPE_LABELS[code];
  return String(code)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function enrichKycRowForApi(row) {
  return {
    ...row,
    identification_type_label: labelForIdentificationType(row.identification_type),
    compliance_status: row.is_compliant === "Y" ? "compliant" : "pending",
  };
}

function customerSummaryForKycList(customer, { totalKyc, compliantKyc, pendingKyc }) {
  const displayName =
    [customer.first_name, customer.middle_name, customer.surname].filter(Boolean).join(" ").trim() ||
    customer.business_name ||
    null;

  let kyc_status = "none";
  if (totalKyc > 0) {
    kyc_status = pendingKyc === 0 ? "verified" : "pending";
  }

  return {
    identifier: customer.identifier,
    display_name: displayName,
    type: customer.type,
    status: customer.status,
    tier: customer.tier,
    environment: customer.environment,
    account_key: customer.account_key,
    kyc_status,
    kyc_record_count: totalKyc,
    kyc_compliant_record_count: compliantKyc,
    kyc_pending_record_count: pendingKyc,
  };
}

export default class KYCService {
  async getAll({ limit, offset, filters }) {
    const conditions = [];
    if (filters.is_compliant) conditions.push(eq(kycs.is_compliant, filters.is_compliant));
    if (filters.account_key) conditions.push(eq(kycs.account_key, filters.account_key));
    if (filters.identification_type) conditions.push(eq(kycs.identification_type, filters.identification_type));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(kycs).where(where).limit(limit).offset(offset).orderBy(desc(kycs.date_created)),
      db.select({ total: count() }).from(kycs).where(where),
    ]);
    return { count: Number(total), rows };
  }

  async getByReference(reference) {
    // Try by KYC reference first
    let [kyc] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

    // Fall back to customer identifier
    if (!kyc) {
      [kyc] = await db
        .select()
        .from(kycs)
        .where(eq(kycs.identifier, reference))
        .limit(1);
    }

    if (!kyc) {
      throw new ErrorClass("KYC not found", 404);
    }
    return kyc;
  }

  async getByCustomer(identifier, { limit, offset }) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.identifier, identifier))
      .limit(1);

    if (!customer) {
      throw new ErrorClass("Customer not found", 404);
    }

    const where = eq(kycs.identifier, identifier);
    const [listBundle, [{ total: compliantTotal }], [{ total: pendingTotal }]] = await Promise.all([
      Promise.all([
        db.select().from(kycs).where(where).limit(limit).offset(offset).orderBy(desc(kycs.date_created)),
        db.select({ total: count() }).from(kycs).where(where),
      ]),
      db.select({ total: count() }).from(kycs).where(and(where, eq(kycs.is_compliant, "Y"))),
      db.select({ total: count() }).from(kycs).where(and(where, ne(kycs.is_compliant, "Y"))),
    ]);
    const [rows, [{ total }]] = listBundle;

    const totalKyc = Number(total);
    const compliantKyc = Number(compliantTotal);
    const pendingKyc = Number(pendingTotal);

    const customerSummary = customerSummaryForKycList(customer, {
      totalKyc,
      compliantKyc,
      pendingKyc,
    });

    return {
      customer: customerSummary,
      count: totalKyc,
      rows: rows.map(enrichKycRowForApi),
    };
  }

  async update(reference, data) {
    const [kyc] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

    if (!kyc) {
      throw new ErrorClass("KYC not found", 404);
    }

    const allowedFields = ["is_compliant"];
    const updateData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ErrorClass("No valid fields to update", 400);
    }

    updateData.date_modified = new Date();
    await db
      .update(kycs)
      .set(updateData)
      .where(eq(kycs.reference, reference));

    const [updated] = await db
      .select()
      .from(kycs)
      .where(eq(kycs.reference, reference))
      .limit(1);

    return updated;
  }
}
