import axios from "axios";
import { stripWrappingQuotes } from "../utils/decryptProdSecret.js";
import { RedbillerPassthroughError } from "../utils/errorClass/index.js";

const DEFAULT_BASE_URL = "https://api.proxy.account.redbiller.com/api";
const KYC_ENABLE_STATUS_PATH = "/v1/auth/sub-accounts/kyc/status/enable";

function getRedbillerProxyBaseUrl() {
  const base = stripWrappingQuotes(process.env.REDBILLER_PROXY_BASE_URL || DEFAULT_BASE_URL);
  return base.replace(/\/$/, "");
}

function buildRedbillerProxyHeaders({ userKey, accountKey }) {
  const headers = {
    Accept: "application/json",
    key: userKey,
    "account-key": accountKey,
  };

  const authorization = stripWrappingQuotes(process.env.REDBILLER_PROXY_AUTHORIZATION || "");
  if (authorization) {
    headers.Authorization = authorization.startsWith("Bearer ")
      ? authorization
      : `Bearer ${authorization}`;
  }

  return headers;
}

/**
 * Proxies Redbiller sub-account KYC enable/status.
 * Outbound auth: `key` = customer user_key, `account-key` = customer account_key.
 * @see https://api.proxy.account.redbiller.com/api/v1/auth/sub-accounts/kyc/status/enable
 */
export async function fetchSubAccountKycEnableStatus({ userKey, accountKey }) {
  const url = `${getRedbillerProxyBaseUrl()}${KYC_ENABLE_STATUS_PATH}`;

  try {
    const response = await axios.get(url, {
      headers: buildRedbillerProxyHeaders({ userKey, accountKey }),
      validateStatus: () => true,
    });

    const status = response.status >= 100 && response.status < 600 ? response.status : 502;
    const data = response.data ?? null;

    if (status >= 400) {
      throw new RedbillerPassthroughError(data, status);
    }

    return { status, data };
  } catch (error) {
    if (error instanceof RedbillerPassthroughError) throw error;
    const status = error?.response?.status;
    if (error?.response?.data != null && status >= 400 && status < 600) {
      throw new RedbillerPassthroughError(error.response.data, status);
    }
    throw new RedbillerPassthroughError(
      {
        state: false,
        message: error?.message || "Unable to reach Redbiller proxy API",
      },
      502,
    );
  }
}
