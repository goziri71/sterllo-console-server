# Frontend: Live Command Center (SSE + full activity)

Real-time ops wall of **everything** teammates do on the console — UI clicks/navigation **and** major API actions.

## Endpoints

All under `/1.202602.0/ops/...`. Permission: **`console.read`**.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ops/command-center/events` | Paginated history |
| POST | `/ops/command-center/activity` | **Ingest UI activity** (clicks, pages, filters) |
| GET | `/ops/command-center/pulse` | Counts in a time window |
| GET | `/ops/command-center/presence` | Who is online (active sessions) |
| GET | `/ops/command-center/stream` | **SSE** live feed |

## History

`GET /ops/command-center/events?page=1&limit=50`

Optional filters: `event_type`, `event_prefix` (e.g. `ui.` or `api.`), `outcome`, `actor_user_id`, `account_key`, `reference`, `from_date`, `to_date`.

## Ingest UI activity (required for clicks / movement)

Backend cannot see pure UI clicks. The SPA must POST them.

`POST /ops/command-center/activity`  
`Authorization: Bearer <jwt>`

### Single event

```json
{
  "event_type": "ui.click",
  "path": "/transactions/pending-review",
  "label": "Resolve",
  "element": "btn-resolve",
  "account_key": "optional",
  "reference": "optional",
  "metadata": { "row_id": 123 }
}
```

### Batch (preferred — flush every 2–5s or on navigation)

```json
{
  "events": [
    {
      "event_type": "ui.page_view",
      "path": "/merchants",
      "client_ts": "2026-09-11T12:00:00.000Z"
    },
    {
      "event_type": "ui.click",
      "path": "/merchants",
      "label": "Open merchant",
      "element": "merchant-row",
      "account_key": "OKwqt…"
    },
    {
      "event_type": "ui.filter",
      "path": "/wallets",
      "label": "status=active",
      "metadata": { "status": "active" }
    }
  ]
}
```

Max **40** events per request. Response **202**.

### Allowed `event_type` values

| Type | When to send |
| --- | --- |
| `ui.page_view` | Route / page entered |
| `ui.navigation` | Sidebar / breadcrumb nav |
| `ui.click` | Buttons, links, row actions |
| `ui.filter` | Filter chips / dropdowns applied |
| `ui.search` | Search submitted / debounced |
| `ui.tab_change` | Tab switched |
| `ui.modal_open` / `ui.modal_close` | Modals / drawers |
| `ui.form_submit` | Forms submitted |
| `ui.copy` | Copy reference / key |
| `ui.export` | Export / download |
| `ui.selection` | Table row / multi-select |

**Do not send** raw `mousemove` / scroll spam — not accepted.

### Suggested FE wiring

1. Global click listener on `[data-audit]` or interactive controls → `ui.click`  
2. Router `onNavigate` → `ui.page_view` / `ui.navigation`  
3. Queue events in memory; `POST /activity` on interval + `visibilitychange` / `beforeunload` (`navigator.sendBeacon` with token is harder — prefer fetch keepalive)  
4. Include `path` (current route) on every event  

## Pulse / Presence / SSE

Same as before:

- Pulse: `GET /ops/command-center/pulse?window_minutes=60`
- Presence: `GET /ops/command-center/presence`
- SSE: `EventSource` with `?access_token=`

```js
const es = new EventSource(
  `https://api.console.sterllo.com/1.202602.0/ops/command-center/stream?access_token=${encodeURIComponent(jwt)}`
);
es.addEventListener("audit", (ev) => {
  const event = JSON.parse(ev.data);
  // prepend to live feed
});
```

### Event shape (stream + history)

```json
{
  "id": 42,
  "event_type": "ui.click",
  "outcome": "success",
  "actor": {
    "user_id": 12,
    "email": "ops@example.com",
    "role": "ops_support",
    "name": "Ops User"
  },
  "target_type": "ui",
  "target_key": "/transactions/pending-review",
  "account_key": null,
  "reference": null,
  "summary": "ui.click — Resolve — /transactions/pending-review",
  "metadata": { "path": "/transactions/pending-review", "label": "Resolve" },
  "date_created": "2026-09-11T11:00:00.000Z"
}
```

### Also auto-logged by backend

- Major actions: approve/cancel, webhook replay, Beamer, RBAC  
- Authenticated **API requests** as `api.request` (command-center endpoints excluded to avoid noise)

## Hosting notes

- APIs: `https://api.console.sterllo.com`  
- Page `https://www.console.sterllo.com/command-center/` is a **frontend** route (SPA must define it)  
- Auth DB migration: `npm run migrate:console-audit`
