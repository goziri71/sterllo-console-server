import axios from "axios";
import { RedbillerPassthroughError } from "../utils/errorClass/index.js";

const REDBILLER_URL =
  "https://api.proxy.account.redbiller.com/api/v1/auth/sub-accounts/kyc/status/enable";

export async function fetchSubAccountKycEnableStatus({ userKey, accountKey }) {
  const response = await axios.get(REDBILLER_URL, {
    headers: {
      key: userKey,
      account_key: accountKey,
    },
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new RedbillerPassthroughError(response.data, response.status);
  }

  return { status: response.status, data: response.data };
}
