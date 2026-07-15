# Sterllo Console Dashboard -- API Endpoints

Base URL: `http://localhost:5000`

**Path prefix:** All routes below use `/<API_VERSION>/…` where `API_VERSION` is exported from `src/services/centralizedversion.js` (currently `1.202602.0`). If you get `Route not found`, the path is often wrong (for example a legacy `/api/v1/…` prefix is not how this app mounts routes).

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Roles: `finance`, `operations`, `ops_support`, `compliance`, `growth`

---

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/1.202602.0/health` | None | Service health check |

---

## Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/1.202602.0/auth/register` | None | Register a new user |
| POST | `/1.202602.0/auth/login` | None | Login with email/password and get JWT token |
| POST | `/1.202602.0/auth/login/crosslink` | None | Login via Redbiller crosslink token (SSO) |
| POST | `/1.202602.0/auth/logout` | JWT | Logout (invalidates current token) |
| GET | `/1.202602.0/auth/profile` | JWT | Get current user profile |
| PATCH | `/1.202602.0/auth/change-password` | JWT | Change password |

### POST `/1.202602.0/auth/register`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "role": "operations"
}
```

### POST `/1.202602.0/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### POST `/1.202602.0/auth/login/crosslink`

Redbiller SSO: validate a one-time crosslink token, match a pre-provisioned user in the auth DB (`biller_id` or `email`), return console JWT plus Redbiller session fields.

**Request**

```json
{
  "token": "<crosslink-token-from-redbiller>"
}
```

**Success (200)**

```json
{
  "code": 200,
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<console-jwt>",
    "authToken": "<console-jwt>",
    "sessionID": "<from-redbiller>",
    "userKey": "<from-redbiller>",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "biller_id": "RB123",
      "roles": ["operations"],
      "permissions": ["console.read"]
    }
  }
}
```

**Errors**

| Status | When |
|--------|------|
| 400 | Missing `token` |
| 401 | Crosslink already used (`code` 7010 from Redbiller) |
| 404 | User not provisioned in auth DB |
| 422 | Redbiller response missing biller/email identifier |
| 500/502 | Redbiller unreachable or invalid response |

**Provisioning:** Users must exist in the auth `Users` table before crosslink login works. Set `email` and optionally `biller_id` to match Redbiller profile. Run `npm run migrate:biller-id` once on the auth DB to add the `biller_id` column.

**Frontend:** Store `token` for `Authorization: Bearer …` on console APIs. Store `sessionID` and `userKey` for Redbiller proxy calls (e.g. KYC enable) that require those headers.

### PATCH `/1.202602.0/auth/change-password`

```json
{
  "current_password": "password123",
  "new_password": "newpassword456"
}
```

---

## Merchants

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/merchants` | All | List all merchants (enriched with ledger_count, currencies, settlement_count) |
| GET | `/1.202602.0/merchants/stats` | All | Merchant metric cards with month-over-month comparison |
| GET | `/1.202602.0/merchants/:account_key` | All | Get single merchant (enriched) |
| GET | `/1.202602.0/merchants/:account_key/customers` | All | Get merchant's customers |
| GET | `/1.202602.0/merchants/:account_key/customers/:identifier/transactions` | All | All transactions for one customer under this merchant (unified statement; requires `financial.read`) |
| GET | `/1.202602.0/merchants/:account_key/ledgers` | All | Get merchant's ledgers |
| GET | `/1.202602.0/merchants/:account_key/settlements` | All | Get merchant's settlements |
| GET | `/1.202602.0/merchants/:account_key/wallets` | All | Get merchant's wallets (enriched with NGN accounts + crypto addresses) |
| GET | `/1.202602.0/merchants/:account_key/wallets/:wallet_key` | All | Get single merchant wallet (enriched) |
| GET | `/1.202602.0/merchants/:account_key/fees` | All | Get merchant's BaaS fee schedule (custom + defaults) |
| GET | `/1.202602.0/merchants/:account_key/kycs` | All | List merchant's own KYC records (not customer KYCs) |
| POST | `/1.202602.0/merchants/:account_key/kyc/approve` | `kyc.update` | Approve merchant KYC (`is_compliant` → `Y`) |
| PATCH | `/1.202602.0/merchants/:account_key` | operations, compliance | Update merchant |

### GET `/1.202602.0/merchants/:account_key/customers/:identifier/transactions`

Returns the same unified transaction payload as `GET /1.202602.0/transactions/statement` with `identifier` and `account_key` set from the path. Confirms `Customers.identifier` belongs to `Customers.account_key = :account_key` before returning data.

**Permission:** `financial.read` (same as the statement endpoint).

**Query params:** Same as the **Transactions** section statement table (`page`, `limit`, `wallet_key`, `status`, `currency_code`, `search`, `from_date`, `to_date`).

### GET `/1.202602.0/merchants` — enriched list response

Each merchant in the list now includes:

```json
{
  "account_key": "OKwqt8DzVvoQXNbhh6HUyQbrYS6ar3",
  "name": "Redbiller Technologies",
  "trade_name": "Redbiller",
  "default_kyc_tier": 1,
  "ledger_count": 3,
  "currencies": ["NGN", "USD"],
  "settlement_count": 12,
  "date_created": "2025-06-25T10:08:50.000Z"
}
```

| Enriched field | Type | Description |
|----------------|------|-------------|
| `ledger_count` | number | Total ledgers (wallets) for this merchant |
| `currencies` | string[] | Distinct currency codes across merchant ledgers |
| `settlement_count` | number | Total settlement ledgers for this merchant |

### GET `/1.202602.0/merchants/stats`

Returns merchant metric cards with month-over-month comparison:

```json
{
  "success": true,
  "data": {
    "total_merchants": {
      "count": 23,
      "new_this_month": 3,
      "new_last_month": 2,
      "change_pct": 50
    },
    "total_customers": 1277,
    "total_ledgers": 156,
    "total_settlements": 89
  }
}
```

### PATCH `/1.202602.0/merchants/:account_key`

```json
{
  "name": "New Name",
  "trade_name": "New Trade Name",
  "default_kyc_tier": 2
}
```

### GET `/1.202602.0/merchants/:account_key/kycs`

Returns KYC rows for the **merchant entity** (matched by `wallet_identifier`, `ledger_identifier`, or `account_key` on the merchant row — not end-customer `identifier` values).

Response includes a `merchant` summary with `kyc_status` (`none` | `pending` | `verified`) plus paginated `records`.

### POST `/1.202602.0/merchants/:account_key/kyc/approve`

Requires **`kyc.update`** (same as customer KYC approval).

Approve one record by reference:

```json
{
  "reference": "kyc-reference-here"
}
```

Omit `reference` to approve **all** pending merchant KYC rows for that merchant.

```json
{
  "approved_count": 1,
  "records": [ { "...kyc row...", "compliance_status": "compliant" } ]
}
```

### Query params (GET list)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `name` | Search by merchant name (partial match) |
| `trade_name` | Search by trade name (partial match) |
| `sort_by` | Sort column: `name`, `trade_name`, `date_created` (default: `date_created`) |
| `order` | Sort direction: `asc` or `desc` (default: `desc`) |

---

## Customers

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/customers` | All | List all customers (enriched with wallet_count, currencies, kyc_status) |
| GET | `/1.202602.0/customers/stats` | All | Customer metric cards with month-over-month comparison |
| GET | `/1.202602.0/customers/:identifier` | All | Get single customer (enriched with wallet_count, currencies, kyc_status) |
| GET | `/1.202602.0/customers/:identifier/metrics` | All | Summary counts for profile cards (wallets, sub-accounts, disputes) |
| GET | `/1.202602.0/customers/:identifier/wallets` | All | Get customer's wallets (NGN/crypto rails + balances when allowed) |
| GET | `/1.202602.0/customers/:identifier/wallets/:wallet_key` | All | Get single customer wallet (balances when allowed) |
| GET | `/1.202602.0/customers/:identifier/wallets/:wallet_key/ledger` | All | Per-wallet ledger lines (service text + balances; requires `financial.read`) |
| GET | `/1.202602.0/customers/:identifier/fees` | All | Get customer's SaaS fee schedule |
| GET | `/1.202602.0/customers/:identifier/kycs` | All | Get customer's KYCs |
| PATCH | `/1.202602.0/customers/:identifier` | `customer.update` | Update customer (status, compliance flags, tier, PND/PNC) |
| PATCH | `/1.202602.0/customers/:identifier/tier` | `customer.update` | Set KYC tier only (`{ "tier": 2 }`) |
| PATCH | `/1.202602.0/customers/:identifier/restrictions` | `customer.update` | Set PND/PNC only (posting restrictions) |
| POST | `/1.202602.0/customers/:identifier/freeze` | `customer.update` | Apply freeze presets (`scope`: `full` \| `debit_only` \| `credit_only`) |
| POST | `/1.202602.0/customers/:identifier/unfreeze` | `customer.update` | Clear PND and PNC (`is_pnd`/`is_pnc` → N) |

> **KYC, freeze, and tier — aligned map** (see also **KYCs** and **Config → customer-tiers** below).

| Goal | Endpoint(s) |
|------|----------------|
| View KYC for one customer | `GET /1.202602.0/customers/:identifier/kycs` (paginated list); optional summary on `GET /1.202602.0/customers/:identifier` (`kyc_status`) |
| Review / approve KYC record | `GET /1.202602.0/kycs/:reference`, `PATCH /1.202602.0/kycs/:reference` (`kyc.update`) |
| Read tier labels | `GET /1.202602.0/config/customer-tiers` |
| Upgrade / set tier | `PATCH /1.202602.0/customers/:identifier/tier` or same fields on `PATCH /1.202602.0/customers/:identifier` |
| Freeze (restrict debits/credits) | `POST /1.202602.0/customers/:identifier/freeze` or `PATCH .../restrictions` or `PATCH /1.202602.0/customers/:identifier` with `is_pnd` / `is_pnc` |
| Unfreeze | `POST /1.202602.0/customers/:identifier/unfreeze` or set both to N via `PATCH .../restrictions` / general `PATCH` |

### GET `/1.202602.0/customers` — enriched list response

Each customer in the list now includes:

```json
{
  "identifier": "a6227257-9307-4544-bb84-3af0d020d508",
  "first_name": "JERAHMEEL",
  "surname": "ANIBOR",
  "status": "PENDING",
  "country_name": "NIGERIA",
  "country_code": "NGA",
  "is_pnd": "N",
  "is_pnc": "N",
  "is_personal_compliant": "N",
  "wallet_count": 2,
  "currencies": ["NGN", "USD"],
  "kyc_status": "verified",
  "date_created": "2025-06-25T15:51:52.000Z"
}
```

| Enriched field | Type | Description |
|----------------|------|-------------|
| `wallet_count` | number | Total wallets for this customer |
| `currencies` | string[] | Distinct currency codes across wallets |
| `kyc_status` | string | `"verified"`, `"pending"`, or `"none"` — derived from KYCs table |

### GET `/1.202602.0/customers/stats`

Returns metric card data with month-over-month comparison:

```json
{
  "success": true,
  "data": {
    "total": {
      "count": 1277,
      "new_this_month": 45,
      "new_last_month": 40,
      "change_pct": 12
    },
    "active": {
      "count": 1100,
      "new_this_month": 38,
      "new_last_month": 30,
      "change_pct": 27
    },
    "kyc_pending": {
      "count": 89,
      "new_this_month": 12,
      "new_last_month": 15,
      "change_pct": -20
    },
    "restricted": {
      "count": 3,
      "new_this_month": 1,
      "new_last_month": 0,
      "change_pct": 100
    }
  }
}
```

`change_pct` = percentage change in new records this month vs last month. Positive = growth, negative = decline.

### PATCH `/1.202602.0/customers/:identifier`

Same validation as the focused routes below. Boolean flags are stored as **`Y` / `N`**; **`1` / `0`** are also accepted in the body and normalized.

```json
{
  "status": "ACTIVE",
  "is_pnd": "N",
  "is_pnc": "N",
  "is_personal_compliant": "Y",
  "is_business_compliant": "Y",
  "tier": 2
}
```

### PATCH `/1.202602.0/customers/:identifier/tier`

```json
{ "tier": 2 }
```

`tier` must be **1**, **2**, or **3**.

### PATCH `/1.202602.0/customers/:identifier/restrictions`

Update posting flags only (at least one field):

```json
{ "is_pnd": "Y", "is_pnc": "N" }
```

### POST `/1.202602.0/customers/:identifier/freeze`

Optional body (defaults to full freeze):

```json
{ "scope": "full" }
```

| `scope` | Effect |
|---------|--------|
| `full` | `is_pnd` and `is_pnc` → `Y` |
| `debit_only` | Post no debit (PND) — `is_pnd` → `Y`, `is_pnc` → `N` |
| `credit_only` | Post no credit (PNC) — `is_pnd` → `N`, `is_pnc` → `Y` |

### POST `/1.202602.0/customers/:identifier/unfreeze`

No body. Sets **`is_pnd`** and **`is_pnc`** to **`N`**.

### Query params (GET list)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `status` | Filter by status |
| `account_key` | Filter by merchant account key |
| `environment` | Filter by environment |
| `sort_by` | Sort column: `name`, `surname`, `date_created`, `status`, `country`, `type` (default: `date_created`) |
| `order` | Sort direction: `asc` or `desc` (default: `desc`) |

### Frontend: merchant customer profile

Use these together on the **merchant → customer detail** screen (profile header, summary cards, wallet list, service/ledger table, recent transactions, disputes).

| UI area | Endpoint | Notes |
|--------|----------|--------|
| Profile + tier / KYC | `GET /1.202602.0/customers/:identifier` | Enriched `wallet_count`, `kyc_status`, etc. |
| KYC records (detail) | `GET /1.202602.0/customers/:identifier/kycs` | Paginated KYC rows for this customer |
| Tier upgrade | `PATCH /1.202602.0/customers/:identifier/tier` | Requires `customer.update` |
| Freeze / unfreeze | `POST .../freeze`, `POST .../unfreeze` | Presets; or `PATCH .../restrictions` |
| Top summary cards (wallets / sub-accounts / disputes) | `GET /1.202602.0/customers/:identifier/metrics` | See response shape below |
| Wallet list + balances | `GET /1.202602.0/customers/:identifier/wallets` | `search`, `page`, `limit`. Balance fields require `financial.read`; otherwise they are redacted |
| Selected wallet detail | `GET /1.202602.0/customers/:identifier/wallets/:wallet_key` | Same permission rules as list |
| Service history / ledger (right-hand table) | `GET /1.202602.0/customers/:identifier/wallets/:wallet_key/ledger` | **Requires `financial.read`**. Query: `search`, `from_date`, `to_date`, `page`, `limit` |
| Recent transactions (all wallets for this customer) | `GET /1.202602.0/transactions/statement` **or** `GET /1.202602.0/merchants/:account_key/customers/:identifier/transactions` | **Requires `financial.read`**. Statement: `identifier` + optional `account_key`. Merchant-scoped URL checks the customer belongs to `:account_key` then returns the same unified feed |
| Disputes tab / count | `GET /1.202602.0/disputes` and/or `GET /1.202602.0/disputes/summary` | Pass `identifier=<customer identifier>` to scope to that customer’s wallets |

#### `GET /1.202602.0/customers/:identifier/metrics`

```json
{
  "code": 200,
  "success": true,
  "message": "Customer view metrics fetched successfully",
  "data": {
    "total_wallets": 351,
    "sub_accounts": 281,
    "disputes": 1247
  }
}
```

| Field | Meaning |
|-------|---------|
| `total_wallets` | Rows in `CustomerWallets` for this customer |
| `sub_accounts` | Customers whose `parent_identifier` equals this `:identifier` |
| `disputes` | Disputes whose `transaction_wallet_key` is one of this customer’s wallet keys |

#### `GET /1.202602.0/customers/:identifier/wallets` — extra query params

| Param | Description |
|-------|-------------|
| `search` | Partial match on `wallet_key` or `wallet_id` |

Response rows include `current_balance`, `balance_last_updated`, `balance_source` when the user has `financial.read` (see RBAC / permissions).

#### `GET /1.202602.0/customers/:identifier/wallets/:wallet_key/ledger` — response row shape

Each record is one ledger line (deposit, withdrawal, transfer, swap, NGN, crypto, etc.):

| Field | Description |
|-------|-------------|
| `line_type` | e.g. `deposit`, `ngn_deposit`, `transfer`, `swap`, … |
| `reference` | Primary reference for the line |
| `service` | Human-readable description / narration |
| `currency_code` | May be `null` for some crypto rows |
| `amount` | String amount |
| `opening_balance` / `closing_balance` | When stored on the underlying row |
| `status` | Line status |
| `date_created` | Timestamp |

---

## KYCs

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/kycs` | All | List all KYCs |
| GET | `/1.202602.0/kycs/:reference` | All | Get single KYC |
| PATCH | `/1.202602.0/kycs/:reference` | compliance | Update KYC |

### PATCH `/1.202602.0/kycs/:reference`

```json
{
  "is_compliant": "1"
}
```

### Query params (GET list)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `is_compliant` | Filter by compliance status |
| `account_key` | Filter by merchant account key |
| `identification_type` | Filter by ID type |

---

## Transactions

All routes require JWT + any role. All are read-only.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/1.202602.0/transactions/deposits` | List deposits |
| GET | `/1.202602.0/transactions/withdrawals` | List withdrawals |
| GET | `/1.202602.0/transactions/transfers` | List transfers |
| GET | `/1.202602.0/transactions/swaps` | List swaps |
| GET | `/1.202602.0/transactions/ngn-deposits` | List NGN deposits |
| GET | `/1.202602.0/transactions/ngn-payouts` | List NGN payouts |
| GET | `/1.202602.0/transactions/crypto-deposits` | List crypto deposits |
| GET | `/1.202602.0/transactions/crypto-payouts` | List crypto payouts |
| GET | `/1.202602.0/transactions/statement` | Unified statement feed across all transaction types |

### Query params (all transaction endpoints)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `account_key` | Filter by merchant account key |
| `identifier` | Customer `identifier` — scopes results to that customer’s wallets (all wallets if `wallet_key` omitted). Validates customer exists; optional `account_key` must match the customer’s merchant; optional `wallet_key` must belong to the customer. Works on **all** transaction list endpoints and **statement**. |
| `wallet_key` | Filter by wallet key (matches source/target and swap legs where applicable) |
| `status` | Filter by status |
| `currency_code` | Filter by currency code (where supported) |
| `search` | Search by reference, wallet key, and transaction-specific identifiers |
| `from_date` | Start date (ISO format) |
| `to_date` | End date (ISO format) |

`GET /1.202602.0/transactions/statement` requires the **`financial.read`** permission (same as other sensitive financial aggregates).

### Statement response (`GET /1.202602.0/transactions/statement`)

Returns a unified, paginated timeline with normalized fields:

```json
{
  "code": 200,
  "success": true,
  "message": "Transaction statement fetched successfully",
  "records": [
    {
      "transaction_type": "transfer",
      "account_key": "OKwqt8DzVvoQXNbhh6HUyQbrYS6ar3",
      "reference": "TRF_abc123",
      "wallet_key": "ce3750bf78a9a46703803908a395a9",
      "currency_code": "NGN",
      "amount": "5000.00",
      "status": "successful",
      "date_created": "2026-02-20T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## Disputes

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/disputes/summary` | All | Dispute counts (total, in_review, escalated, resolved) with optional filters |
| GET | `/1.202602.0/disputes` | All | List all disputes |
| GET | `/1.202602.0/disputes/:dispute_reference` | All | Get single dispute |
| PATCH | `/1.202602.0/disputes/:dispute_reference` | operations, compliance | Update dispute |

### PATCH `/1.202602.0/disputes/:dispute_reference`

```json
{
  "status": "resolved",
  "settlement_status": "settled"
}
```

### Query params (GET list and GET summary)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `status` | Filter by dispute status |
| `account_key` | Filter by merchant account key |
| `identifier` | Customer `identifier` — only disputes whose `transaction_wallet_key` belongs to one of that customer’s wallets |
| `user_key` | Filter by user key on the dispute |
| `settlement_status` | Filter by settlement status |
| `search` | Search dispute / transaction / settlement references |
| `from_date` / `to_date` | Date range on `date_created` |
| `sort_by` / `order` | Sort list (see disputes service) |

---

## Overdrafts

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/overdrafts` | All | List all overdraft requests |
| GET | `/1.202602.0/overdrafts/:reference` | All | Get single overdraft |
| PATCH | `/1.202602.0/overdrafts/:reference` | operations | Update overdraft |

### PATCH `/1.202602.0/overdrafts/:reference`

```json
{
  "status": "approved"
}
```

### Query params (GET list)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `status` | Filter by status |
| `account_key` | Filter by merchant account key |

---

## Config

All routes require JWT + any role (except whitelisted IPs).

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/config/currencies` | All | List currencies |
| GET | `/1.202602.0/config/vats` | All | List VAT rates |
| GET | `/1.202602.0/config/customer-tiers` | All | List customer tiers |
| GET | `/1.202602.0/config/financial-institutions` | All | List Nigerian financial institutions |
| GET | `/1.202602.0/config/crypto-assets` | All | List supported crypto assets |
| GET | `/1.202602.0/config/deposit-methods` | All | List deposit methods |
| GET | `/1.202602.0/config/whitelisted-ips` | operations, compliance | List whitelisted IPs |

### Query params

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |

Financial institutions also supports:

| Param | Description |
|-------|-------------|
| `is_deleted` | Filter by deleted status (`Y`/`N`) |

Whitelisted IPs also supports:

| Param | Description |
|-------|-------------|
| `account_key` | Filter by merchant account key |
| `is_enabled` | Filter by enabled status |

---

## Fees

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/fees/defaults` | All | Get all default (platform-wide) fee schedules |

### Response structure for fee endpoints

Fee responses are grouped by type:

```json
{
  "success": true,
  "data": {
    "deposit": [...],
    "payout": [...],
    "swap": [...],
    "transfer": [...],
    "withdrawal": [...],
    "overdraft_processing": [...],
    "wallet_maintenance": [...]
  }
}
```

### Merchant fees (`GET /1.202602.0/merchants/:account_key/fees`)

Returns both custom (merchant-specific) BaaS fees and platform defaults:

```json
{
  "success": true,
  "data": {
    "custom": {
      "deposit": [...],
      "payout": [...],
      "swap": [...],
      "transfer": [...],
      "withdrawal": [...],
      "overdraft_processing": [...],
      "wallet_maintenance": [...]
    },
    "defaults": {
      "deposit": [...],
      "payout": [...],
      "swap": [...],
      "transfer": [...],
      "withdrawal": [...],
      "overdraft_processing": [...],
      "wallet_maintenance": [...]
    }
  }
}
```

### Customer fees (`GET /1.202602.0/customers/:identifier/fees`)

Returns the SaaS fee schedule set by the customer's parent merchant:

```json
{
  "success": true,
  "data": {
    "deposit": [...],
    "payout": [...],
    "swap": [...],
    "transfer": [...],
    "withdrawal": [...]
  }
}
```

---

## Wallets (Enriched)

Wallet endpoints return the base wallet/ledger data enriched with linked NGN deposit accounts, crypto deposit addresses, and a derived `current_balance` (from the most recent `closing_balance` seen for that wallet across transaction tables).

### Merchant wallets (`GET /1.202602.0/merchants/:account_key/wallets`)

Paginated. Each wallet includes:

```json
{
  "wallet_key": "...",
  "currency_code": "NGN",
  "current_balance": "125000.75",
  "balance_last_updated": "2026-02-09T15:22:48.000Z",
  "balance_source": "derived_from_latest_closing_balance",
  "ngn_deposit_accounts": [
    {
      "bank_name": "BEAMER MICROFINANCE BANK",
      "bank_code": "090591",
      "bank_slug": "BEAMER",
      "account_name": "JOHN DOE",
      "account_number": "9000001662",
      "type": "STATIC",
      "service": "WALLET",
      "is_pnd": "N",
      "is_pnc": "N",
      "is_deactivated": "N",
      "vendor": "BEAMER",
      "reference": "...",
      "date_created": "2025-07-02T03:55:09.000Z"
    }
  ],
  "crypto_deposit_addresses": [
    {
      "asset": "USDT",
      "network": "TRC20",
      "address_name": "Deposit Address",
      "address": "TXyz...",
      "type": "STATIC",
      "service": "WALLET",
      "vendor": "BLOCKRADAR",
      "vendor_wallet_id": "...",
      "reference": "...",
      "date_created": "2025-10-03T12:00:00.000Z"
    }
  ]
}
```

`current_balance` is derived from the latest `closing_balance` for the wallet found across: `Deposits`, `Withdrawals`, `Transfers`, `Swaps`, `NGNDeposits`, `NGNPayouts`, `CryptocurrencyDeposits`, and `CryptocurrencyPayouts`.







### Wallet page endpoint (merchant + customer)

`GET /1.202602.0/wallets/page` is a unified endpoint tailored for the console wallet page UI. It supports both merchant and customer contexts with the same response shape.

#### Query params

| Param | Required | Description |
|-------|----------|-------------|
| `owner_type` | Yes | `merchant` or `customer` |
| `owner_key` | Yes | Merchant `account_key` when `owner_type=merchant`, or customer `identifier` when `owner_type=customer` |
| `page` | No | Page number (default: 1) |
| `limit` | No | Items per page (default: 20) |
| `search` | No | Search by `wallet_key`, `wallet_id`, `owner_key` (account key / customer identifier), or owner name (partial match) |
| `currency_code` | No | Filter wallets by currency code |
| `status` | No | `all`, `active`, `inactive` (derived status) |

#### Response

```json
{
  "success": true,
  "data": {
    "summary": {
      "total_wallets": 127,
      "total_value": "2400000000.00",
      "active_wallets": 120,
      "pending_transactions": 1498
    },
    "records": [
      {
        "owner_type": "merchant",
        "owner_key": "OKwqt8DzVvoQXNbhh6HUyQbrYS6ar3",
        "owner_name": "Redbiller",
        "country_name": null,
        "country_code": null,
        "wallet_key": "ce3750bf78a9a46703803908a395a9",
        "wallet_id": "714488e7-8626-4319-be80-65e2b677eeb9",
        "currency_code": "NGN",
        "current_balance": "3669.3625",
        "pending_transactions_count": 4,
        "status": "active",
        "date_created": "2025-12-25T13:40:25.000Z",
        "last_activity_at": "2026-01-28 17:05:35",
        "balance_source": "derived_from_latest_closing_balance"
      }
    ],
    "pagination": {
      "total": 127,
      "page": 1,
      "limit": 20,
      "total_pages": 7,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

### Query params (wallet list endpoints)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |

---

## Dashboard (Role-Aware)

All routes require JWT + any role. Summary data is cached for 60 seconds. The response adapts based on the authenticated user's role — everyone gets a shared `overview`, plus a `department` section with metrics specific to their role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/1.202602.0/dashboard/summary` | All | Role-aware aggregate stats (shared overview + department-specific metrics) |
| GET | `/1.202602.0/dashboard/activities` | All | Role-aware recent activities feed |

### GET `/1.202602.0/dashboard/summary`

Returns a shared `overview` for all roles, plus a `department` object whose contents depend on the authenticated user's role.

#### Shared overview (all roles)

```json
{
  "success": true,
  "data": {
    "overview": {
      "total_customers": 1247,
      "total_wallets": 3456,
      "transactions_today": 892,
      "open_disputes": 45,
      "system_uptime_seconds": 864000
    },
    "department": { ... }
  }
}
```

#### Department section by role

**Finance** (`role: "finance"`)

```json
"department": {
  "role": "finance",
  "settlement_status": {
    "completed_today_ngn": "32349490023.11",
    "pending_ngn": "41932322.87",
    "completed_today_count": 156,
    "pending_count": 23
  },
  "currency_usage": [
    { "currency_code": "NGN", "wallet_count": 800 },
    { "currency_code": "USD", "wallet_count": 200 }
  ],
  "currency_volume": [
    { "currency_code": "NGN", "total_volume": "16432890.50" },
    { "currency_code": "USD", "total_volume": "10245300.00" },
    { "currency_code": "GBP", "total_volume": "13800200.00" },
    { "currency_code": "GHS", "total_volume": "11200100.30" },
    { "currency_code": "USDT", "total_volume": "450000.00" }
  ],
  "total_ngn_deposits_today": 342,
  "total_ngn_payouts_today": 189
}
```

**Operations** (`role: "operations"`)

```json
"department": {
  "role": "operations",
  "open_disputes": 45,
  "pending_overdraft_requests": 8,
  "transfers_today": 234,
  "ngn_payouts_today": 189,
  "ngn_payouts_pending": 12,
  "crypto_payouts_today": 47
}
```

**Ops Support** (`role: "ops_support"`)

```json
"department": {
  "role": "ops_support",
  "customers_onboarded_today": 34,
  "customers_onboarded_this_week": 156,
  "disputes_filed_today": 7,
  "disputes_resolved_today": 3,
  "recent_customer_count": 50
}
```

**Compliance** (`role: "compliance"`)

```json
"department": {
  "role": "compliance",
  "kyc_pending_approval": 45,
  "id_verification_pending_approval": 12,
  "customers_flagged_pnd": 3,
  "customers_flagged_pnc": 1,
  "non_compliant_personal": 18,
  "non_compliant_business": 6
}
```

**Growth** (`role: "growth"`)

```json
"department": {
  "role": "growth",
  "customers_onboarded_today": 34,
  "customers_onboarded_this_week": 156,
  "wallets_created_today": 67,
  "wallets_created_this_week": 312,
  "active_merchants": 23,
  "currency_usage": [
    { "currency_code": "NGN", "wallet_count": 800 },
    { "currency_code": "USD", "wallet_count": 200 }
  ],
  "currency_volume": [
    { "currency_code": "NGN", "total_volume": "16432890.50" },
    { "currency_code": "USD", "total_volume": "10245300.00" },
    { "currency_code": "GBP", "total_volume": "13800200.00" }
  ]
}
```

### GET `/1.202602.0/dashboard/activities`

Returns recent activities filtered by role relevance. The activity types returned depend on the authenticated user's role.

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |

#### Activity types by role

| Role | Activity types included |
|------|----------------------|
| **finance** | `ngn_deposit_received`, `ngn_payout_processed`, `crypto_deposit_received`, `crypto_payout_processed`, `transfer_processed` |
| **operations** | `dispute_created`, `dispute_resolved`, `transfer_processed`, `ngn_payout_processed`, `crypto_payout_processed`, `overdraft_requested` |
| **ops_support** | `customer_onboarded`, `wallet_created`, `dispute_created`, `dispute_resolved` |
| **compliance** | `kyc_submitted`, `kyc_approved`, `customer_flagged`, `customer_onboarded` |
| **growth** | `customer_onboarded`, `wallet_created`, `merchant_activated` |

#### Response

```json
{
  "success": true,
  "records": [
    {
      "type": "dispute_created",
      "description": "Dispute DR7x89 filed",
      "reference": "DR7x89",
      "timestamp": "2026-02-03T10:30:00.000Z"
    },
    {
      "type": "ngn_payout_processed",
      "description": "NGN payout of 50000 processed",
      "reference": "PAY_abc123",
      "timestamp": "2026-02-03T10:25:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

All activity types: `customer_onboarded`, `wallet_created`, `dispute_created`, `dispute_resolved`, `transfer_processed`, `ngn_deposit_received`, `ngn_payout_processed`, `crypto_deposit_received`, `crypto_payout_processed`, `overdraft_requested`, `kyc_submitted`, `kyc_approved`, `customer_flagged`, `merchant_activated`

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common status codes:

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized / invalid token |
| 403 | Forbidden / insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |
| 429 | Rate limited (100 req/15 min) |
| 500 | Server error |

---

## Frontend handoff — new & changed APIs (merchant customer view)

Use this section as a single checklist to share with the frontend team. All paths are under the same API base as the rest of this document (e.g. `/1.202602.0/...`). Every call below needs **`Authorization: Bearer <jwt>`** unless your deployment wraps versioning differently.

### Permissions

| Permission | Where it matters |
|------------|------------------|
| **`financial.read`** | Customer wallet **balances** on list/detail; **`GET .../wallets/.../ledger`**; **`GET /transactions/statement`**; **`GET /merchants/.../customers/.../transactions`**. Without it, balance fields are redacted or the call returns **403**. |
| **`CONSOLE_READ`** (or equivalent JWT access) | All listed routes (standard dashboard read). |

### Endpoints to wire (copy-paste reference)

| What to build on the UI | Method | Path |
|-------------------------|--------|------|
| Summary cards (total wallets, sub-accounts, disputes) | `GET` | `/1.202602.0/customers/:identifier/metrics` |
| Customer profile row | `GET` | `/1.202602.0/customers/:identifier` |
| Wallet list (search + pagination + balances when allowed) | `GET` | `/1.202602.0/customers/:identifier/wallets` |
| One wallet (balances when allowed) | `GET` | `/1.202602.0/customers/:identifier/wallets/:wallet_key` |
| Service / ledger table for **selected** wallet | `GET` | `/1.202602.0/customers/:identifier/wallets/:wallet_key/ledger` |
| **All** customer transactions (scoped by customer; optional filters) | `GET` | `/1.202602.0/transactions/statement` **or** merchant-scoped shortcut below |
| Same “all transactions” but URL encodes merchant + customer | `GET` | `/1.202602.0/merchants/:account_key/customers/:identifier/transactions` |
| Disputes list for that customer | `GET` | `/1.202602.0/disputes?identifier=:identifier&...` |
| Dispute summary counts for that customer | `GET` | `/1.202602.0/disputes/summary?identifier=:identifier&...` |

### Query parameters the frontend should pass

| Endpoint | Params |
|----------|--------|
| `GET .../customers/:identifier/wallets` | `page`, `limit`, **`search`** (filters `wallet_key` / `wallet_id`) |
| `GET .../wallets/:wallet_key/ledger` | `page`, `limit`, `search`, `from_date`, `to_date` |
| `GET .../transactions/statement` | **`identifier`** (customer id), optional **`account_key`** (must match that customer’s merchant), plus `page`, `limit`, `wallet_key`, `status`, `currency_code`, `search`, `from_date`, `to_date` |
| `GET .../merchants/:account_key/customers/:identifier/transactions` | Same as statement **except** `identifier` and `account_key` come from the path; still pass `page`, `limit`, filters as query string |
| `GET .../disputes` and `.../disputes/summary` | **`identifier`** (customer id) to restrict to that customer’s wallet keys; existing filters still work (`account_key`, `status`, etc.) |

### Response notes (high level)

- **`GET .../metrics`** — JSON `data`: `{ "total_wallets", "sub_accounts", "disputes" }`.
- **Customer wallets list / detail** — rows include `current_balance`, `balance_last_updated`, `balance_source` when the user has **`financial.read`**; otherwise those fields are redacted.
- **Ledger** — paginated `records` (or your standard pagination shape): each line has `line_type`, `reference`, `service`, `currency_code`, `amount`, `opening_balance`, `closing_balance`, `status`, `date_created`.
- **Statement / merchant customer transactions** — same shape as the existing unified statement (transaction types, amounts, dates, etc.).
- **`GET .../merchants/.../customers/.../transactions`** — returns **404** if customer id is unknown, **400** if that customer is **not** under `:account_key`.

### Optional (already documented elsewhere)

- Unified wallet console UI can still use **`GET /1.202602.0/wallets/page`** with `owner_type=customer` and `owner_key=<identifier>` if you prefer one endpoint for wallet search/summary across owners.
