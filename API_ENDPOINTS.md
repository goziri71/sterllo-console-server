# Sterllo Console Dashboard -- API Endpoints

Base URL: `http://localhost:5000`

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Roles: `finance`, `operations`, `ops_support`, `compliance`, `growth`

---

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/health` | None | Service health check |

---

## Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | None | Register a new user |
| POST | `/api/v1/auth/login` | None | Login and get JWT token |
| POST | `/api/v1/auth/logout` | JWT | Logout (invalidates current token) |
| GET | `/api/v1/auth/profile` | JWT | Get current user profile |
| PATCH | `/api/v1/auth/change-password` | JWT | Change password |

### POST `/api/v1/auth/register`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "role": "operations"
}
```

### POST `/api/v1/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### PATCH `/api/v1/auth/change-password`

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
| GET | `/api/v1/merchants` | All | List all merchants (enriched with customer_count, ledger_count, currencies, settlement_count) |
| GET | `/api/v1/merchants/stats` | All | Merchant metric cards with month-over-month comparison |
| GET | `/api/v1/merchants/:account_key` | All | Get single merchant (enriched) |
| GET | `/api/v1/merchants/:account_key/customers` | All | Get merchant's customers |
| GET | `/api/v1/merchants/:account_key/ledgers` | All | Get merchant's ledgers |
| GET | `/api/v1/merchants/:account_key/settlements` | All | Get merchant's settlements |
| GET | `/api/v1/merchants/:account_key/wallets` | All | Get merchant's wallets (enriched with NGN accounts + crypto addresses) |
| GET | `/api/v1/merchants/:account_key/wallets/:wallet_key` | All | Get single merchant wallet (enriched) |
| GET | `/api/v1/merchants/:account_key/fees` | All | Get merchant's BaaS fee schedule (custom + defaults) |
| PATCH | `/api/v1/merchants/:account_key` | operations, compliance | Update merchant |

### GET `/api/v1/merchants` — enriched list response

Each merchant in the list now includes:

```json
{
  "account_key": "OKwqt8DzVvoQXNbhh6HUyQbrYS6ar3",
  "name": "Redbiller Technologies",
  "trade_name": "Redbiller",
  "default_kyc_tier": 1,
  "customer_count": 45,
  "ledger_count": 3,
  "currencies": ["NGN", "USD"],
  "settlement_count": 12,
  "date_created": "2025-06-25T10:08:50.000Z"
}
```

| Enriched field | Type | Description |
|----------------|------|-------------|
| `customer_count` | number | Total customers under this merchant |
| `ledger_count` | number | Total ledgers (wallets) for this merchant |
| `currencies` | string[] | Distinct currency codes across merchant ledgers |
| `settlement_count` | number | Total settlement ledgers for this merchant |

### GET `/api/v1/merchants/stats`

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

### PATCH `/api/v1/merchants/:account_key`

```json
{
  "name": "New Name",
  "trade_name": "New Trade Name",
  "default_kyc_tier": 2
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
| GET | `/api/v1/customers` | All | List all customers (enriched with wallet_count, currencies, kyc_status) |
| GET | `/api/v1/customers/stats` | All | Customer metric cards with month-over-month comparison |
| GET | `/api/v1/customers/:identifier` | All | Get single customer (enriched with wallet_count, currencies, kyc_status) |
| GET | `/api/v1/customers/:identifier/wallets` | All | Get customer's wallets (enriched with NGN accounts + crypto addresses) |
| GET | `/api/v1/customers/:identifier/wallets/:wallet_key` | All | Get single customer wallet (enriched) |
| GET | `/api/v1/customers/:identifier/fees` | All | Get customer's SaaS fee schedule |
| GET | `/api/v1/customers/:identifier/kycs` | All | Get customer's KYCs |
| PATCH | `/api/v1/customers/:identifier` | operations, compliance | Update customer |

### GET `/api/v1/customers` — enriched list response

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

### GET `/api/v1/customers/stats`

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

### PATCH `/api/v1/customers/:identifier`

```json
{
  "status": "active",
  "is_pnd": "0",
  "is_pnc": "0",
  "is_personal_compliant": "1",
  "is_business_compliant": "1",
  "tier": 2
}
```

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

---

## KYCs

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/kycs` | All | List all KYCs |
| GET | `/api/v1/kycs/:reference` | All | Get single KYC |
| PATCH | `/api/v1/kycs/:reference` | compliance | Update KYC |

### PATCH `/api/v1/kycs/:reference`

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
| GET | `/api/v1/transactions/deposits` | List deposits |
| GET | `/api/v1/transactions/withdrawals` | List withdrawals |
| GET | `/api/v1/transactions/transfers` | List transfers |
| GET | `/api/v1/transactions/swaps` | List swaps |
| GET | `/api/v1/transactions/ngn-deposits` | List NGN deposits |
| GET | `/api/v1/transactions/ngn-payouts` | List NGN payouts |
| GET | `/api/v1/transactions/crypto-deposits` | List crypto deposits |
| GET | `/api/v1/transactions/crypto-payouts` | List crypto payouts |

### Query params (all transaction endpoints)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `account_key` | Filter by merchant account key |
| `wallet_key` | Filter by wallet key |
| `status` | Filter by status |
| `from_date` | Start date (ISO format) |
| `to_date` | End date (ISO format) |

---

## Disputes

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/disputes` | All | List all disputes |
| GET | `/api/v1/disputes/:dispute_reference` | All | Get single dispute |
| PATCH | `/api/v1/disputes/:dispute_reference` | operations, compliance | Update dispute |

### PATCH `/api/v1/disputes/:dispute_reference`

```json
{
  "status": "resolved",
  "settlement_status": "settled"
}
```

### Query params (GET list)

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |
| `status` | Filter by dispute status |
| `account_key` | Filter by merchant account key |
| `settlement_status` | Filter by settlement status |

---

## Overdrafts

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/overdrafts` | All | List all overdraft requests |
| GET | `/api/v1/overdrafts/:reference` | All | Get single overdraft |
| PATCH | `/api/v1/overdrafts/:reference` | operations | Update overdraft |

### PATCH `/api/v1/overdrafts/:reference`

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
| GET | `/api/v1/config/currencies` | All | List currencies |
| GET | `/api/v1/config/vats` | All | List VAT rates |
| GET | `/api/v1/config/customer-tiers` | All | List customer tiers |
| GET | `/api/v1/config/financial-institutions` | All | List Nigerian financial institutions |
| GET | `/api/v1/config/crypto-assets` | All | List supported crypto assets |
| GET | `/api/v1/config/deposit-methods` | All | List deposit methods |
| GET | `/api/v1/config/whitelisted-ips` | operations, compliance | List whitelisted IPs |

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
| GET | `/api/v1/fees/defaults` | All | Get all default (platform-wide) fee schedules |

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

### Merchant fees (`GET /api/v1/merchants/:account_key/fees`)

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

### Customer fees (`GET /api/v1/customers/:identifier/fees`)

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

### Merchant wallets (`GET /api/v1/merchants/:account_key/wallets`)

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

`GET /api/v1/wallets/page` is a unified endpoint tailored for the console wallet page UI. It supports both merchant and customer contexts with the same response shape.

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
| GET | `/api/v1/dashboard/summary` | All | Role-aware aggregate stats (shared overview + department-specific metrics) |
| GET | `/api/v1/dashboard/activities` | All | Role-aware recent activities feed |

### GET `/api/v1/dashboard/summary`

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

### GET `/api/v1/dashboard/activities`

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
