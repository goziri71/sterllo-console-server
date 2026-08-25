import axios from "axios";
import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { deposits } from "../db/schema/transactions.js";
import { ngnDeposits } from "../db/schema/fiat.js";
import { merchants } from "../db/schema/merchants.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { buildSterlloCredentialsHeader } from "../utils/sterlloApiCredentials.js";

const STERLLO_VERIFY_DEPOSIT_URL =
  "https://api.sterllo.com/1.0/Customers/Wallets/Deposits/Verify";

function trimStr(value) {
  return value == null ? "" : String(value).trim();
}

async function resolveDepositContext(reference) {
  const ref = trimStr(reference);
  if (!ref) return null;

  const [ledger] = await db
    .select({
      currency_code: deposits.currency_code,
      user_key: deposits.user_key,
      account_key: deposits.account_key,
      source_reference: deposits.source_reference,
    })
    .from(deposits)
    .where(or(eq(deposits.source_reference, ref), eq(deposits.target_reference, ref)))
    .limit(1);

  if (ledger) {
    return {
      currency_code: ledger.currency_code,
      user_key: ledger.user_key,
      account_key: ledger.account_key,
      reference: ledger.source_reference || ref,
    };
  }

  const [ngn] = await db
    .select({
      deposit_reference: ngnDeposits.deposit_reference,
      wallet_key: ngnDeposits.wallet_key,
    })
    .from(ngnDeposits)
    .where(eq(ngnDeposits.deposit_reference, ref))
    .limit(1);

  if (!ngn) return null;

  return {
    currency_code: "NGN",
    user_key: null,
    account_key: null,
    reference: ngn.deposit_reference || ref,
  };
}

async function resolveMerchantKeys(accountKey) {
  const key = trimStr(accountKey);
  if (!key) return null;
  const [merchant] = await db
    .select({
      user_key: merchants.user_key,
      account_key: merchants.account_key,
    })
    .from(merchants)
    .where(eq(merchants.account_key, key))
    .limit(1);
  return merchant || null;
}

/**
 * Replay merchant deposit webhook via Sterllo Verify Deposit (notify: true).
 *
 * Body (console):
 * - reference (required)
 * - currency_code (optional if deposit found)
 * - session_id (Crosslink sessionID — required unless Credentials provided)
 * - user_key / account_key (optional; filled from deposit / merchant when possible)
 * - Credentials (optional; pre-built header skips encoding)
 */
export async function replayDepositWebhook(payload = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const reference = trimStr(body.reference);
  if (!reference) {
    throw new ErrorClass("reference is required", 400);
  }

  const deposit = await resolveDepositContext(reference);

  let currencyCode = trimStr(body.currency_code) || trimStr(deposit?.currency_code);
  if (!currencyCode) {
    throw new ErrorClass("currency_code is required", 400);
  }

  let credentialsHeader = trimStr(body.Credentials || body.credentials);
  if (!credentialsHeader) {
    let userKey = trimStr(body.user_key || body.userKey) || trimStr(deposit?.user_key);
    let accountKey =
      trimStr(body.account_key || body.accountKey) || trimStr(deposit?.account_key);
    const sessionId = trimStr(body.session_id || body.sessionID || body.sessionId);

    if (!userKey || !accountKey) {
      const merchant = await resolveMerchantKeys(accountKey || body.account_key);
      if (merchant) {
        userKey = userKey || trimStr(merchant.user_key);
        accountKey = accountKey || trimStr(merchant.account_key);
      }
    }

    if (!userKey || !accountKey || !sessionId) {
      throw new ErrorClass(
        "Credentials require user_key, account_key, and session_id (Crosslink sessionID), or pass Credentials",
        400,
      );
    }

    credentialsHeader = buildSterlloCredentialsHeader(userKey, accountKey, sessionId);
  }

  const requestBody = {
    currency_code: currencyCode.toUpperCase(),
    reference: deposit?.reference || reference,
    notify: true,
  };

  try {
    const response = await axios.post(STERLLO_VERIFY_DEPOSIT_URL, requestBody, {
      headers: {
        Credentials: credentialsHeader,
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    });

    return {
      httpStatus: response.status >= 100 && response.status < 600 ? response.status : 502,
      body: response.data,
    };
  } catch (error) {
    if (error instanceof ErrorClass) throw error;
    const status = error?.response?.status;
    return {
      httpStatus: status >= 100 && status < 600 ? status : 502,
      body: error?.response?.data ?? {
        state: false,
        message: error.message || "Sterllo Verify Deposit request failed",
      },
    };
  }
}
