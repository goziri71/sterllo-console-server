# Frontend Guide: Beamer NGN Payout TSQ

Resolve / query status of a pending NGN payout via ISVS Beamer TSQ.

Product keys use the **same transport as account-link**: decrypted `SOURCE_PRODUCT_KEY` / `TARGET_PRODUCT_KEY` from env are placed inside the encrypted **`Credentials`** header (not sent by the UI).

## Endpoint

- **Method:** `POST`
- **URL:** `/1.202602.0/merchants/:account_key/integrations/beamer/ngn-tsq`
- **Permission:** `merchant.update`
- **Upstream ISVS:** `POST https://api.isvs.sterllo.com/1.202510.0/Payouts/Beamer/NG/TSQ`

## Request body (same envelope style as account-link)

```json
{
  "headers": {
    "Request-Id": "uuid"
  },
  "data": {
    "reference": "string"
  }
}
```

### Notes

- Backend injects product keys the same way as link (`Credentials` cryptojs wire).
- Inside Credentials: `Target-Product-Key`, `Source-Product-Key`, `Request-Id` (no `User-Key` / `Accout-Key` for TSQ).
- `Request-Id` is optional in the body — server generates one if omitted.
- `data.reference` is required.
- Body to ISVS is encrypted `{ payload }` containing `{ reference }`, same pattern as link.

## Response

ISVS JSON unchanged. HTTP status is ISVS’s status (usually **200**).
