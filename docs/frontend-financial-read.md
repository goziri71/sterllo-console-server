# Frontend guide: financial data access (`financial.read`)

This document covers **(A)** auth profile / RBAC fields the UI must read correctly, **(B)** `financial.read` and redaction, and **(C)** admin endpoints to assign roles.

The API hides **balances, amounts, fees, volumes, and other monetary fields** unless the signed-in user is allowed to see them. Access is controlled through **RBAC permissions** in the auth database.

**Permission key (money):** `financial.read`  
**Full access (money + everything implied by `*`):** effective permission set includes `*` (management role in RBAC).

For envelope shapes (`code` / `state` / `success`), see [frontend-api-response.md](./frontend-api-response.md). Note: some routes use `success: true` and `code: 200`; RBAC admin routes use `state: true` and `code: 2000`.

---

## 0. Roles, permissions, and “Admin tools” (read this first)

### 0.1 Where `roles` and `permissions` appear

Effective RBAC comes from tables `rbac_user_roles` + `rbac_role_permissions` on the **auth** database. The legacy `Users.role` column is **not** the source of truth for the API.

The backend returns **`roles`**, **`permissions`**, and a single display **`role`** (primary slug when multiple roles exist) on:

| Endpoint | Response shape |
|----------|------------------|
| **POST** `{API_PREFIX}/auth/login` | `{ code, success, data: { user, token } }` — **`user` includes `roles`, `permissions`, `role`** |
| **POST** `{API_PREFIX}/auth/register` | same as login |
| **GET** `{API_PREFIX}/auth/profile` | `{ code, success, data: { …user, roles, permissions, role } }` |

**Critical for the frontend:** read arrays from **`data.user`** (login/register) or **`data`** (profile), not from the top-level JSON. Example:

```ts
// Login
const user = response.data.user;
const roles = user.roles ?? [];
const permissions = user.permissions ?? [];

// Profile
const profile = response.data;
const roles = profile.roles ?? [];
const permissions = profile.permissions ?? [];
```

If the UI only stored **`data.user`** from an older API that omitted `roles` / `permissions`, it would show **“No roles on profile”** even when the database is correct. **Re-login after deploying** the API that includes these fields on login, or **always call GET `/auth/profile`** after login and use that payload as the source of truth.

### 0.2 Who can open RBAC admin APIs (`/rbac/*`)

Routes under **`/rbac`** use **`requireRbacManage`**: the user must have **`rbac.manage`** **or** **`*`** in their effective permission set.

The **management** role is seeded with permission **`*`**, so a user with only the **management** role should pass this check **if** RBAC rows exist in the **same** database the running API uses.

Helpers:

```ts
const ALL = "*";
const RBAC_MANAGE = "rbac.manage";

export function canManageRbac(permissions: string[] | undefined | null): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(ALL) || permissions.includes(RBAC_MANAGE);
}
```

### 0.3 If `roles` / `permissions` are empty arrays

| Cause | What to do |
|--------|------------|
| **Wrong response path** | Use `data.user.roles` / `data.user.permissions` (login) or `data.roles` / `data.permissions` (profile). |
| **Stale session** | Log out and log in again; after role changes, `token_version` may invalidate old tokens. |
| **Production DB never migrated / user not linked** | On the **auth** DB used in production, run `npm run migrate:auth-rbac` and/or `npm run set:user-management-only -- user@email.com`, or assign roles via API using another admin. |
| **Different API URL** | Admin UI must call the **same** base URL / `{API_PREFIX}` as the console API that owns the `Users` + `rbac_*` tables. |
| **Browser “CORS error” on DELETE / PATCH only** | The API must allow those methods in CORS (see `app.js` `@fastify/cors` `methods`). Default CORS often omits **DELETE** and **PATCH**, which breaks revoke role and save role permissions. |

---

## 1. Detecting financial access in the UI

Use the **`permissions`** array from login or profile (see §0.1).

**GET** `{API_PREFIX}/auth/profile` (authenticated) — same fields as login `user` object.

| Field | Type | Use |
|--------|------|-----|
| `permissions` | `string[]` | Effective permission keys for this user. |
| `roles` | `string[]` | Assigned role slugs (e.g. `management`, `finance`, `operations`). |
| `role` | `string \| null` | Single slug for display (prefers `management` when multiple roles exist). |

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

You need **`*`** or **`rbac.manage`** on your own user (via login/profile `permissions`) or every RBAC call returns **403**.

There are **two different ways** to “give access” — do not mix them up:

### A) Give a **person** a role (e.g. “make this user Finance”)

Use the **user’s `user_key`** from `GET /rbac/users` or profile.

- **POST** `{API_PREFIX}/rbac/users/:userKey/roles`  
- Body: `{ "role_slug": "finance" }` — **snake_case** `role_slug`, not `roleSlug`.

This does **not** use `PATCH …/roles/:id/permissions`. It only links that user to an existing role.

### B) Change what a **role** is allowed to do (affects everyone with that role)

- **PATCH** `{API_PREFIX}/rbac/roles/:roleId/permissions`  
- Body: `{ "permission_keys": ["console.read", "financial.read", ...] }` — **must** be the key **`permission_keys`** (snake_case). If the frontend sends `permissionKeys` (camelCase), the server sees **no keys** and the save can **fail** (e.g. empty list, or management role missing `*`).

Rules:

- **`management` role:** the list **must include `"*"`**. If you remove `*`, the API returns **400** on purpose.
- **Any other role:** `*` is **not** allowed — only real keys like `console.read`, `financial.read`, `rbac.manage`, etc.

### If “give access” fails — check this first

| Symptom | Likely cause |
|--------|----------------|
| **403** on any `/rbac/...` | Your logged-in user does not have `*` or `rbac.manage`. Fix roles in DB or use another admin. |
| **400** when saving a role | Wrong JSON keys (`permissionKeys` instead of `permission_keys`), or **management** row without `"*"`, or a permission string that does not exist in `GET /rbac/permissions`. |
| **400** when assigning user | Body must be `{ "role_slug": "finance" }` with a real slug from `GET /rbac/roles`. |

---

**API prefix:** `{API_PREFIX}` — see `API_VERSION` in `src/services/centralizedversion.js` (e.g. `/1.202602.0`).

| Action | Method | Path | Body / notes |
|--------|--------|------|----------------|
| **List team (users)** | GET | `{API_PREFIX}/rbac/users` | Query: `page`, `limit`, optional `search`, optional `role_slug`. |
| List permissions | GET | `{API_PREFIX}/rbac/permissions` | Valid strings for `permission_keys`. |
| List roles + their keys | GET | `{API_PREFIX}/rbac/roles` | Each role has `id`, `slug`, `permission_keys`. |
| Create role | POST | `{API_PREFIX}/rbac/roles` | `slug`, `label`, `permission_keys` (snake_case). |
| Replace role permissions | PATCH | `{API_PREFIX}/rbac/roles/:roleId/permissions` | `{ "permission_keys": [...] }` only. |
| Assign role to user | POST | `{API_PREFIX}/rbac/users/:userKey/roles` | `{ "role_slug": "finance" }` — **different** from PATCH above. |
| Revoke role | DELETE | `{API_PREFIX}/rbac/users/:userKey/roles/:roleSlug` | |

Seeded roles may already include `financial.read` after migration `002`; **custom roles** need `financial.read` added in **B** if they should see money.

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
