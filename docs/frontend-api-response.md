# API response envelope (frontend)

All JSON responses that follow the console standard use the **same top-level shape**. Prefer reading the body fields over relying only on HTTP status, but still handle non-2xx HTTP when proxies or networks fail.

## Standard shape

```json
{
  "code": 2000,
  "state": true,
  "message": "Successful.",
  "data": {}
}
```

| Field     | Type    | Meaning |
|-----------|---------|---------|
| `code`    | number  | Application result code (see below). **Always in the thousands** for this API (`2000`, `4000`, `4040`, …). |
| `state`   | boolean | `true` = business success; `false` = failure. |
| `message` | string  | Human-readable summary (show in UI or logs). |
| `data`    | object or array | Payload; often `{}` on errors. For some list endpoints, `data` is the **array of rows** and **`pagination`** is a separate top-level field with metadata. |

## Success

- **`code`:** `2000`
- **`state`:** `true`
- **`message`:** Typically `"Successful."` (exact text may vary slightly per endpoint).
- **`data`:** Endpoint-specific payload (e.g. a single entity, or an **array** for list endpoints).
- **`pagination`:** (List endpoints only) Metadata object (`total`, `page`, `limit`, `total_pages`, `has_next`, `has_prev`) — **sibling** of `data`, not nested under it.
- **HTTP:** Usually `200` for successful operations handled by this API.

**Suggested client logic:** treat as success when `state === true` (and optionally `code === 2000`).

## Errors (global handler and not-found)

Failures use the **same envelope**, with `state: false` and a **thousand-range** `code`.

- **`code`:** Derived from the server error’s HTTP class:
  - For standard HTTP-style errors (`400`, `404`, `500`, …), the body uses **`HTTP × 10`** (e.g. `400` → `4000`, `404` → `4040`, `500` → `5000`).
  - If the server already uses a numeric code **≥ 1000**, that value is sent as-is and HTTP status is **`Math.floor(code / 10)`** (e.g. `4000` → HTTP `400`).
- **`state`:** `false`
- **`message`:** Safe user-facing text for **4xx**; for **5xx** often a generic message (details may appear under `data.debug` in non-production).
- **`data`:** Usually `{}`; may contain `debug` on server errors in development.

**Unknown route (not found):** HTTP `404`, body like `{ "code": 4040, "state": false, "message": "Route not found", "data": {} }`.

**Suggested client logic:**

1. If HTTP is not OK, read JSON if present; use `message` for UI.
2. Treat as API-level failure when `state === false` or when `code !== 2000` (for endpoints that use this contract).
3. Optional grouping by `code`:
   - **4xxx** in the body → client / validation / not-found class (HTTP 4xx).
   - **5xxx** in the body → server error class (HTTP 5xx).

## TypeScript sketch

```ts
type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

type ApiEnvelope<T = unknown> = {
  code: number;
  state: boolean;
  message: string;
  data: T;
  pagination?: PaginationMeta;
};

function isApiSuccess<T>(body: ApiEnvelope<T>): body is ApiEnvelope<T> & { state: true; code: 2000 } {
  return body.state === true && body.code === 2000;
}
```

## Scope / legacy

New and updated console routes should follow this envelope. Some older routes (e.g. health checks) may still use different field names until migrated—prefer this document for customer and similarly updated modules.
