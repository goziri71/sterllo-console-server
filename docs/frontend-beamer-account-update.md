# Frontend Guide: Beamer Account Update

This document explains how frontend should call the Beamer account update endpoint exposed by this backend.

## Credentials For Link / Update (Merchants List)

There is no separate “second database” user list. Use the main merchants listing (or single merchant fetch); each row includes optional **`udara360`** details joined from `Udara360APICredentials` on `account_key` (latest credential row per merchant when several exist).

- **Method:** `GET`
- **URL:** `/1.202602.0/merchants` (paginated list) or `/1.202602.0/merchants/:account_key` (use your deployed `API_VERSION` prefix)
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

## Endpoints

Use the same API version prefix as the rest of the console (e.g. `/1.202602.0`).

### Link (Udara / Beamer)

- **Method:** `POST`
- **URL:** `/1.202602.0/merchants/:account_key/integrations/beamer/account-link`
- **Permission:** `merchant.update`
- **Body (preferred):** matches `docs/isvs-beamer-link.json` (ISVS `Account/Link`).
```json
{
  "headers": {
    "User-Key": "merchant user_key",
    "Accout-Key": "merchant account_key",
    "Request-Id": "uuid",
    "Credentials": "Udara client secret (optional here if sent as data.client.key)"
  },
  "data": {
    "account_number": "string",
    "client": { "id": "string", "key": "string" }
  }
}
```
- The backend forwards **`Credentials`** to ISVS (from `headers.Credentials` or **`data.client.key`**, decrypted when AES/base64). ISVS rejects the call without this header.
- **Also accepted:** empty `{}` if you send `User-Key`, `Accout-Key`, and `Request-Id` as **HTTP headers** — the backend fills them from headers + merchant row.
- **Also accepted:** flat JSON `{ "account_number", "client_id", "client_key", "user_key", "account_key", "request_id" }`.
- `User-Key` / `Accout-Key` default from the merchant row when omitted; `Request-Id` is auto-generated if omitted.
- `account_number` / `client.id` can default from existing `udara360` on the merchant; **`client.key` must still be sent** (not stored on the public merchant payload).

### Update

- **Method:** `POST`
- **URL:** `/1.202602.0/merchants/:account_key/integrations/beamer/account-update`
- **Auth:** Same auth flow used for other merchant update endpoints
- **Permission required:** `merchant.update`

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

- **Preferred body:** `{ "headers": { "Request-Id": "uuid" }, "data": { "id", "account_number", "client": { "id", "key" } } }`
- **Also accepted:** `{}` or flat JSON if `Request-Id` is sent as an **HTTP header** (or omitted — server generates one).
- `data.id`, `account_number`, and `client.id` can default from the merchant’s **`udara360`** row when present.
- **`client.key` must still be sent** in the body (not exposed on public merchant responses).
- `Target-Product-Key` and `Source-Product-Key` are injected by the backend from env (not sent by the UI).

## Success / ISVS response

The response **body is the ISVS JSON unchanged** (same shape as `docs/isvs-beamer-link.json` response). HTTP status is ISVS’s status (usually **200**), not derived from ISVS `code` (so `4013` does not become HTTP 401).

Example success:

```json
{
  "code": 2000,
  "state": true,
  "message": "Successful.",
  "data": { "id": "..." }
}
```

Example ISVS error (still HTTP 200 from upstream):

```json
{
  "code": 4013,
  "state": false,
  "message": "Request denied.",
  "data": { "reason": "..." }
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
await fetch(`/1.202602.0/merchants/${accountKey}/integrations/beamer/account-update`, {
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
