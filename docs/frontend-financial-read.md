# Frontend guide: financial data access (`financial.read`)

The API hides **balances, amounts, fees, volumes, and other monetary fields** unless the signed-in user is allowed to see them. Access is controlled only through **RBAC permissions**, not hardcoded job titles in the client.

**Permission key:** `financial.read`  
**Full access:** users whose effective permission set includes `*` (management / super-admin) always see financial data.

For envelope shapes (`code` / `state` / `success`), see [frontend-api-response.md](./frontend-api-response.md). Note: some routes use `success: true` and `code: 200`; RBAC admin routes use `state: true` and `code: 2000`.

---

## 1. Detecting access in the UI

After login (or on app load), use the **profile** payload. The backend merges permissions from all assigned roles.

**GET** `{API_PREFIX}/auth/profile` (authenticated)

Relevant fields on the user object inside the response body (exact nesting matches your existing auth client):

| Field | Type | Use |
|--------|------|-----|
| `permissions` | `string[]` | Effective permission keys for this user. |
| `roles` | `string[]` | Assigned role slugs (e.g. `finance`, `operations`). |

**Client helper (recommended):**

```ts
const FINANCIAL_READ = "financial.read";
const ALL = "*";

export function canReadFinancial(permissions: string[] | undefined | null): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(ALL) || permissions.includes(FINANCIAL_READ);
}
```

Use `canReadFinancial(user.permissions)` to:

- Show or hide balance/amount columns, charts, and export buttons.
- Avoid calling endpoints that return **403** without permission (e.g. transaction statement).
- Decide whether to show wallet **status** filters (server rejects the filter without `financial.read`).

**Important:** If you cache the user in memory or local storage, refresh profile (or re-login) after an admin changes roles or permissions so `permissions` stays accurate.

---

## 2. How management grants access

Administrators need **`rbac.manage`** (or equivalent full access) to change roles.

**API prefix:** `{API_PREFIX}` is the versioned root used by the app (see `API_VERSION` in `src/services/centralizedversion.js`, e.g. `/1.202602.0`).

| Action | Method | Path | Body / notes |
|--------|--------|------|----------------|
| List permissions | GET | `{API_PREFIX}/rbac/permissions` | Includes `financial.read` with description. |
| List roles + their keys | GET | `{API_PREFIX}/rbac/roles` | Each role has `permission_keys`. |
| Create role | POST | `{API_PREFIX}/rbac/roles` | `slug`, `label`, `permission_keys: string[]`. |
| Replace role permissions | PATCH | `{API_PREFIX}/rbac/roles/:roleId/permissions` | `permission_keys: string[]` — include `financial.read` to allow financial UI for that role. |
| Assign role to user | POST | `{API_PREFIX}/rbac/users/:userKey/roles` | `role_slug`. |
| Revoke role | DELETE | `{API_PREFIX}/rbac/users/:userKey/roles/:roleSlug` | |

Seeded roles that receive `financial.read` after migration `002` include finance/operations-related roles; **custom roles** need `financial.read` added explicitly if they should see money.

---

## 3. API behavior when the user **has** `financial.read` or `*`

- All monetary fields are returned as populated values (subject to normal business logic).
- Wallet list supports **`status`** filter where the API already supports it.
- Transaction **statement** endpoint is allowed.

---

## 4. API behavior when the user **does not** have `financial.read` (and not `*`)

### 4.1 General redaction rules

For many JSON objects, any property whose name matches server-side “financial” rules is set to **`null`** in the response (deeply, for nested objects). Typical examples:

- `amount`, `fee`, `total_amount`, `total_value`
- Keys containing `balance`
- Keys ending with `_amount`
- Keys containing `volume`

**Do not** treat `null` as zero; treat it as **hidden / not authorized**.

### 4.2 Wallets

**Merchant wallets**

- **GET** `.../wallets/merchants/:account_key`  
- **GET** `.../wallets/merchants/:account_key/:wallet_key`  

Balance-related fields (e.g. `current_balance`, `balance_last_updated`, `balance_source`, `last_activity_at`) are cleared; derived `status` may be cleared when it was balance-based.

**Wallet page (admin list)**

- **GET** `.../wallets` (query: `owner_type`, `owner_key`, etc.)

Summary includes:

- `financial_fields_redacted: true`
- Aggregates such as `total_value`, `active_wallets`, `pending_transactions` may be **`null`** (only `total_wallets` count remains meaningful in the redacted path).

**Status filter:** sending `status` other than the default “all” behavior **without** `financial.read` returns **HTTP 403** with a message about requiring `financial.read`. The UI should disable or hide status filtering when `!canReadFinancial(...)`.

### 4.3 Transactions

- **List endpoints** (deposits, withdrawals, transfers, swaps, NGN/crypto variants): rows are redacted per §4.1.
- **GET** statement endpoint: **403** — message like *“Transaction statement requires financial.read permission”*. Hide the statement UI or show an upgrade/permission message.

### 4.4 Settlements

- **Summary**, **batch list**, **batch detail**: monetary fields redacted (`null`) per §4.1.

### 4.5 Overdrafts

- **List**, **detail**, **update** responses: monetary fields redacted per §4.1.

### 4.6 Dashboard

**GET** `.../dashboard/summary`

- **Finance / growth (and management’s embedded finance & growth):** NGN settlement **amount** fields may be `null`; `currency_volume` may be an **empty array**; **counts** can still be present (e.g. completed/pending settlement counts).
- **Overview / operations / compliance** blocks are largely count-based; still verify fields in your UI if you display any amount-like metrics.

**GET** `.../dashboard/activities`

For activity types that normally include amounts in `description`, the server replaces them with **generic labels** (e.g. “Transfer processed”, “NGN deposit received”) so amounts do not appear in text.

---

## 5. UX recommendations

1. **Single source of truth:** derive all “show money” behavior from `canReadFinancial(profile.permissions)`.
2. **Empty states:** for tables, use a column placeholder such as “—” or “Hidden” when values are `null` due to policy (optional tooltip: “Requires financial access”).
3. **Statements & exports:** gate on permission before calling; on 403, show a clear message that an administrator must assign `financial.read` (or a role that includes it).
4. **Wallet status filter:** disable when `!canReadFinancial` to avoid avoidable 403s.
5. **Admin screens:** when editing a role, show `financial.read` in the permission picker with a short label, e.g. “View balances & transaction amounts”.

---

## 6. Scope note (customer wallet routes)

Customer-scoped wallet endpoints under **`/customers/:identifier/wallets`** may still return balance-oriented data without checking `financial.read`. If the product must hide customer balances for the same roles, confirm with backend before relying on redaction there; prefer reusing `canReadFinancial` in the UI for consistency until aligned.

---

## 7. Backend reference (for support / tickets)

| Area | Server helper / behavior |
|------|---------------------------|
| Permission constants | `src/config/permissions.js` — `FINANCIAL_READ` |
| Effective check | `src/utils/financialAccess.js` — `userCanReadFinancial`, `redactFinancialDeep` |
| DB permission seed | `scripts/migrations/002_auth_rbac_financial_read_mysql.sql` |
