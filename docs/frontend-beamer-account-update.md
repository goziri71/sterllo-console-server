# Frontend Guide: Beamer Account Update

This document explains how frontend should call the Beamer account update endpoint exposed by this backend.

## Credentials For Link / Update (Merchants List)

There is no separate “second database” user list. Use the main merchants listing (or single merchant fetch); each row includes optional **`udara360`** details joined from `Udara360APICredentials` on `account_key` (latest credential row per merchant when several exist).

- **Method:** `GET`
- **URL:** `/api/v1/merchants` (paginated list) or `/api/v1/merchants/:account_key`
- **Permission:** `CONSOLE_READ`

Each merchant object may include:

```json
"udara360": {
  "id": 1,
  "identifier": "string",
  "account_number": "string",
  "auth_type": "BEARER",
  "client_id": "string",
  "expiry_date": "2026-01-01T00:00:00.000Z",
  "date_created": "2026-01-01T00:00:00.000Z",
  "date_modified": null
}
```

Or `"udara360": null` when no credential row exists. Secrets (`client_secret`, tokens) are **not** returned.

Use `udara360.client_id`, `udara360.account_number`, and merchant `user_key` / `account_key` as needed when building Beamer link/update payloads.

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
