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
| GET | `/api/v1/merchants` | All | List all merchants |
| GET | `/api/v1/merchants/:account_key` | All | Get single merchant |
| GET | `/api/v1/merchants/:account_key/customers` | All | Get merchant's customers |
| GET | `/api/v1/merchants/:account_key/ledgers` | All | Get merchant's ledgers |
| GET | `/api/v1/merchants/:account_key/settlements` | All | Get merchant's settlements |
| PATCH | `/api/v1/merchants/:account_key` | operations, compliance | Update merchant |

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

---

## Customers

All routes require JWT + any role.

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/customers` | All | List all customers |
| GET | `/api/v1/customers/:identifier` | All | Get single customer |
| GET | `/api/v1/customers/:identifier/wallets` | All | Get customer's wallets |
| GET | `/api/v1/customers/:identifier/kycs` | All | Get customer's KYCs |
| PATCH | `/api/v1/customers/:identifier` | operations, compliance | Update customer |

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
| GET | `/api/v1/config/whitelisted-ips` | operations, compliance | List whitelisted IPs |

### Query params

| Param | Description |
|-------|-------------|
| `page` | Page number (default: 1) |
| `limit` | Items per page (default: 20) |

Whitelisted IPs also supports:

| Param | Description |
|-------|-------------|
| `account_key` | Filter by merchant account key |
| `is_enabled` | Filter by enabled status |

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
