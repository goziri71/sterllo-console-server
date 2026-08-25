# Frontend: Replay deposit webhook

Console proxies Sterllo **Verify Deposit** with `notify: true` so the merchant callback is resent.

## Endpoint

`POST /1.202602.0/transactions/deposits/webhook-replay`

Auth: Bearer JWT. Permission: **`merchant.update`**.

## Request body

Minimum when deposit exists in DB and Crosslink session is available:

```json
{
  "reference": "ad03fad5-5ccb-45a4-8be9-48185a193338",
  "currency_code": "NGN",
  "session_id": "<Crosslink sessionID>"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `reference` | yes | Deposit / source reference |
| `currency_code` | if not on deposit row | e.g. `NGN`, `USD` |
| `session_id` | unless `Credentials` passed | From Crosslink MFA / ecosystem login (`sessionID`) |
| `user_key` | if not on deposit | Merchant / wallet user key |
| `account_key` | if not on deposit | Merchant account key |
| `Credentials` | optional | Pre-built Sterllo header; skips encoding |

Backend builds Sterllo `Credentials` as Base64(`JSON({ key, account_key, session_id })`), same shape as the wallet SDK.

## Response

HTTP status and JSON body are passed through from Sterllo unchanged.

## UI tip

On a deposit detail / statement row, expose **Replay webhook** that posts the deposit `reference` + current Crosslink `session_id` (and `currency_code` from the row).
