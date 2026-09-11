# Frontend: Live Command Center (SSE)

Real-time ops wall of team actions on the console.

## Endpoints

All under `/1.202602.0/ops/...`. Permission: **`console.read`**.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/ops/command-center/events` | Paginated history |
| GET | `/ops/command-center/pulse` | Counts in a time window |
| GET | `/ops/command-center/presence` | Who is online (active sessions) |
| GET | `/ops/command-center/stream` | **SSE** live feed |

## History

`GET /ops/command-center/events?page=1&limit=50`

Optional filters: `event_type`, `outcome`, `actor_user_id`, `account_key`, `reference`, `from_date`, `to_date`.

## Pulse

`GET /ops/command-center/pulse?window_minutes=60`

Returns totals + `by_type` + `live_subscribers`.

## Presence

`GET /ops/command-center/presence`

Active MFA sessions with email, role, last_seen.

## Live SSE

`EventSource` cannot set `Authorization` headers reliably — use query token:

```js
const url = `/1.202602.0/ops/command-center/stream?access_token=${encodeURIComponent(jwt)}`;
const es = new EventSource(url);

es.addEventListener("audit", (ev) => {
  const event = JSON.parse(ev.data);
  // prepend to live feed
});

es.onerror = () => {
  // browser auto-reconnects; send Last-Event-ID header on reconnect if using fetch polyfill
};
```

Also accepts `Authorization: Bearer <jwt>` if using a fetch-based SSE client.

Heartbeat comments are sent every ~15s so proxies keep the connection.

### Event shape

```json
{
  "id": 42,
  "event_type": "beamer.ngn_tsq",
  "outcome": "success",
  "actor": {
    "user_id": 12,
    "user_key": "...",
    "email": "ops@example.com",
    "role": "ops_support",
    "name": "Ops User"
  },
  "session_id": "...",
  "target_type": "ngn_payout",
  "target_key": "ACCOUNT_KEY",
  "account_key": "ACCOUNT_KEY",
  "reference": "payout-live-ref",
  "summary": "Beamer NGN TSQ resolve for payout-live-ref",
  "metadata": {},
  "ip_address": "1.2.3.4",
  "user_agent": "...",
  "date_created": "2026-09-11T11:00:00.000Z"
}
```

### Event types (Phase 1)

- `transaction.approve` / `transaction.cancel`
- `deposit.webhook_replay`
- `beamer.account_link` / `beamer.account_update` / `beamer.ngn_tsq`
- `rbac.role_permissions_updated` / `rbac.user_role_assigned` / `rbac.user_role_revoked` / `rbac.user_created`

## Suggested UI

1. Load history + pulse + presence on mount  
2. Open SSE stream and prepend new `audit` events  
3. Filter chips by `event_type` / actor / outcome  
4. Show presence strip from `/presence`
