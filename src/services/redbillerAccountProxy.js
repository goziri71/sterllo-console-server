import axios from "axios";
import { stripWrappingQuotes } from "../utils/decryptProdSecret.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const DEFAULT_BASE_URL = "https://api.proxy.account.redbiller.com/api";
const KYC_ENABLE_STATUS_PATH = "/v1/auth/sub-accounts/kyc/status/enable";

function getRedbillerProxyBaseUrl() {
  const base = stripWrappingQuotes(process.env.REDBILLER_PROXY_BASE_URL || DEFAULT_BASE_URL);
  return base.replace(/\/$/, "");
}

function buildRedbillerProxyHeaders({ userKey, accountKey }) {
  const headers = {
    Accept: "application/json",
    "x-user-key": userKey,
    "x-account-key": accountKey,
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
 * @see https://api.proxy.account.redbiller.com/api/v1/auth/sub-accounts/kyc/status/enable
 */
export async function fetchSubAccountKycEnableStatus({ userKey, accountKey }) {
  const url = `${getRedbillerProxyBaseUrl()}${KYC_ENABLE_STATUS_PATH}`;

  try {
    const response = await axios.get(url, {
      headers: buildRedbillerProxyHeaders({ userKey, accountKey }),
      validateStatus: () => true,
    });

    return {
      status: response.status,
      data: response.data ?? null,
    };
  } catch (error) {
    throw new ErrorClass(
      error?.message || "Unable to reach Redbiller proxy API",
      502,
    );
  }
}
