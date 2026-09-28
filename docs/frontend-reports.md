# Frontend: reports, growth exports, compliance anomalies

Base prefix: `/1.202602.0/reports` (authenticated).

Most money reports require **`financial.read`**. Customer growth export requires **`console.read`**.

## Common query params

| Param | Description |
|-------|-------------|
| `from_date`, `to_date` | ISO date/datetime filters |
| `account_key`, `identifier`, `currency_code`, `status`, `search`, `wallet_key` | Scope (where supported) |
| `limit` | Max rows (default 5000, cap 5000) |
| `format` | `json` (default) or `csv` (attachment download) |

## Report endpoints

| Report | GET path |
|--------|----------|
| Settlements (+ summary in `data.summary`) | `/reports/settlements` |
| Unified transactions | `/reports/transactions` |
| Deposits | `/reports/deposits` |
| Transfers | `/reports/transfers` |
| Customer wallet balances | `/reports/customer-balances` |
| Opening / closing (per wallet in range) | `/reports/opening-closing-balances` |
| Balance snapshot | `/reports/balance-snapshot` |
| VAT totals by currency | `/reports/vat` |
| NGN payout vendors | `/reports/vendors` |
| Revenue (fees) by merchant | `/reports/revenue` |

## Growth

| Export | GET path | Extra params |
|--------|----------|--------------|
| Revenue by merchant | `/reports/growth/revenue-by-merchant` | same as revenue |
| Customers | `/reports/growth/customers` | `scope=all\|active` |

## Compliance anomalies

`GET /1.202602.0/compliance/transaction-anomalies` — requires **`financial.read`**.

| Param | Default | Meaning |
|-------|---------|---------|
| `identifier` | — | Customer identifier filter |
| `window_ms` | `1000` | Max gap for duplicate same-amount transfers |
| `min_amount` | `1000000` | High-ticket threshold |
| `from_date`, `to_date`, `limit` | — | Range and row cap |

Response `data.rows` includes `anomaly_type`: `same_ticket_millisecond` or `high_ticket`.

## CSV

Add `format=csv` to any report URL. Response is `text/csv` with `Content-Disposition: attachment`.

Without `financial.read`, monetary fields in JSON are redacted (CSV export should be gated in UI).
