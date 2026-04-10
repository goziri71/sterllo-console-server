# How RBAC works in this console (plain language)

This is the mental model for **roles**, **slugs**, **permissions**, and **users**.

---

## 1. Four building blocks

| Concept | What it is | Example |
|--------|------------|---------|
| **Permission** | A single capability string stored in the database. | `console.read`, `financial.read`, `rbac.manage`, `*` |
| **Role** | A named **group** of permissions. Think “job template”. | `management`, `finance`, `operations` |
| **User** | A person who logs in (`Users` table: email, password, `user_key`, …). | `goziri71@gmail.com` |
| **User ↔ role link** | Which template(s) apply to **this** user. A user can have **more than one** role. | Rows in `rbac_user_roles` |

At runtime the API loads **all roles** for that user, unions their permissions, and puts the result on `request.user` as a **Set** (`permissionKeys`).

---

## 2. What is a **slug**?

A **slug** is the **stable string id** of a role: lowercase, no spaces, used in URLs and JSON.

- **Role id (number)** — internal database primary key, e.g. `1`, `2`. Used in paths like `/rbac/roles/2/permissions`.
- **Role slug (string)** — human/API name, e.g. `management`, `finance`.

Same role: **id `2`** might be slug **`finance`** (depends on insert order in your DB). Always use **list roles** (`GET /rbac/roles`) to see `id` + `slug` together.

---

## 3. Special permission: **`*`** (star)

- **`*`** means **full access**: every `requirePermission(...)` check passes, including RBAC admin routes (`rbac.manage` is not required if you already have `*`).
- Only the seeded **management** role is allowed to have `*` in the database (custom roles cannot be given `*`).
- When saving the **management** role via PATCH, the body **must still include `"*"`** in `permission_keys`. If the UI sends a list **without** `*`, the API rejects the save so nobody accidentally removes all access for every management user.

---

## 4. “Management” in two senses

| Meaning | What it refers to |
|--------|-------------------|
| **Management role** | Row in `rbac_roles` with slug `management`, usually linked to permission `*`. |
| **A user who is an admin** | A user who has the **management** role (or another role with `rbac.manage` / `*`) assigned in `rbac_user_roles`. |

**Editing “your own access” as a person** is done by **assigning roles to your user** (`POST /rbac/users/:userKey/roles`), not by deleting `*` from the management role.

**Editing what the finance team can do** is done by **PATCH** on that role’s permissions (`/rbac/roles/:roleId/permissions`).

---

## 5. End-to-end flow after login

1. User logs in; response includes **`roles`** and **`permissions`** (from RBAC tables).
2. Each API route can require a permission (e.g. `console.read`) or `rbac.manage` for `/rbac/*`.
3. If the user’s merged permissions include `*` or the required key, the request succeeds.

Legacy column **`Users.role`** is **not** used for authorization anymore; only **`rbac_user_roles`** + **`rbac_role_permissions`** matter.

---

## 6. Related docs

- [frontend-financial-read.md](./frontend-financial-read.md) — profile fields, `financial.read`, redaction, RBAC API table.
