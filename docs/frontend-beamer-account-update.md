# Frontend Guide: Beamer Account Update

This document explains how frontend should call the Beamer account update endpoint exposed by this backend.

## List Users To Link (Second DB)

Use this endpoint to fetch users from the second DB (`__accounts`) before calling link/update actions.

- **Method:** `GET`
- **URL:** `/api/v1/merchants/integrations/beamer/accounts`
- **Auth:** Same auth flow used for merchant read endpoints
- **Permission required:** `CONSOLE_READ`
- **Query params (optional):**
  - `page` (default pagination behavior)
  - `limit` (default pagination behavior)

### Response Shape

```json
{
  "code": 200,
  "success": true,
  "message": "Sterllo users fetched successfully",
  "data": {
    "count": 210,
    "rows": [
      {
        "id": 32574,
        "user_key": "string",
        "account_key": "string",
        "name": "string",
        "trade_name": "string|null",
        "email_address": "string|null",
        "phone_number": "string|null",
        "product_id": "string",
        "date_created": "2026-04-24T12:53:21.000Z"
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total_pages": 11
  }
}
```

### Notes

- Results are filtered server-side by `STERLLO_PRODUCT_ID` from env.
- Use values from each row (`id`, `account_key`, and client data from your flow) to build the body for update/link calls.

## Endpoint

- **Method:** `POST`
- **URL:** `/api/v1/merchants/:account_key/integrations/beamer/account-update`
- **Auth:** Same auth flow used for other merchant update endpoints
- **Permission required:** `MERCHANT_UPDATE`

## Path Param

- `account_key` (string): Merchant account key in this console backend

## Request Body

Send JSON with this shape:

```json
{
  "headers": {
    "Request-Id": "string"
  },
  "data": {
    "id": "string",
    "account_number": "string",
    "client": {
      "id": "string",
      "key": "string"
    }
  }
}
```

### Important

- Frontend must send all `data` fields itself: `data.id`, `data.account_number`, `data.client.id`, `data.client.key`.
- Backend does **not** auto-fill `data.id` or `data.client.key`.
- Frontend sends only `Request-Id` inside `headers`.
- `Target-Product-Key` and `Source-Product-Key` are injected by backend from encrypted env values.
- `Request-Id` should be unique per request to support traceability and retries.

## Success Response

Backend returns standard success envelope and forwards upstream data:

```json
{
  "code": 200,
  "success": true,
  "message": "Beamer account update completed",
  "data": {
    "code": 2000,
    "state": true,
    "message": "Successful."
  }
}
```

## Error Cases

- `400` when required fields are missing:
  - `headers.Request-Id`
  - `data.id`
  - `data.account_number`
  - `data.client.id`
  - `data.client.key`
- `404` when merchant `account_key` does not exist
- `502` when upstream Beamer service fails unexpectedly
- Upstream `4xx/5xx` may be surfaced with upstream message

## Frontend Example (fetch)

```ts
await fetch(`/api/v1/merchants/${accountKey}/integrations/beamer/account-update`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    headers: {
      "Request-Id": crypto.randomUUID(),
    },
    data: {
      id: beamerIntegrationId,
      account_number: accountNumber,
      client: {
        id: clientId,
        key: clientKey,
      },
    },
  }),
});
```
