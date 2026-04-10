import { and, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { authDb, authPool } from "../db/index.js";
import { users } from "../db/schema/users.js";
import {
  rbacPermissions,
  rbacRoles,
  rbacRolePermissions,
  rbacUserRoles,
} from "../db/schema/authRbac.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { ROLES } from "../config/roles.js";
import { clearUserCache } from "../utils/userCache.js";

const SLUG_RE = /^[a-z][a-z0-9_]{1,63}$/;

export async function loadUserAccess(userId) {
  const userRoleRows = await authDb
    .select({ slug: rbacRoles.slug, roleId: rbacRoles.id })
    .from(rbacUserRoles)
    .innerJoin(rbacRoles, eq(rbacUserRoles.role_id, rbacRoles.id))
    .where(eq(rbacUserRoles.user_id, userId));

  if (userRoleRows.length === 0) {
    return { roleSlugs: [], permissionKeys: new Set() };
  }

  const roleIds = [...new Set(userRoleRows.map((r) => r.roleId))];
  const permRows = await authDb
    .select({ key: rbacPermissions.permission_key })
    .from(rbacRolePermissions)
    .innerJoin(
      rbacPermissions,
      eq(rbacRolePermissions.permission_id, rbacPermissions.id),
    )
    .where(inArray(rbacRolePermissions.role_id, roleIds));

  const permissionKeys = new Set(permRows.map((p) => p.key));
  const roleSlugs = [...new Set(userRoleRows.map((r) => r.slug))];
  return { roleSlugs, permissionKeys };
}

async function bumpTokenVersionForUserIds(userIds) {
  if (userIds.length === 0) return;
  const unique = [...new Set(userIds)];
  const placeholders = unique.map(() => "?").join(",");
  await authPool.execute(
    `UPDATE Users SET token_version = COALESCE(token_version,0) + 1, date_modified = ? WHERE id IN (${placeholders})`,
    [new Date(), ...unique],
  );
  const keys = await authDb
    .select({ user_key: users.user_key })
    .from(users)
    .where(inArray(users.id, unique));
  for (const row of keys) {
    clearUserCache(row.user_key);
  }
}

async function userIdsForRole(roleId) {
  const rows = await authDb
    .select({ user_id: rbacUserRoles.user_id })
    .from(rbacUserRoles)
    .where(eq(rbacUserRoles.role_id, roleId));
  return rows.map((r) => r.user_id);
}

export default class RbacService {
  async listPermissions() {
    return authDb
      .select()
      .from(rbacPermissions)
      .orderBy(rbacPermissions.permission_key);
  }

  async listRoles() {
    const roles = await authDb.select().from(rbacRoles).orderBy(rbacRoles.slug);
    const out = [];
    for (const role of roles) {
      const perms = await authDb
        .select({ key: rbacPermissions.permission_key })
        .from(rbacRolePermissions)
        .innerJoin(
          rbacPermissions,
          eq(rbacRolePermissions.permission_id, rbacPermissions.id),
        )
        .where(eq(rbacRolePermissions.role_id, role.id));
      out.push({
        ...role,
        permission_keys: perms.map((p) => p.key),
      });
    }
    return out;
  }

  /**
   * List auth DB users with assigned roles (for team / RBAC admin UIs).
   * Uses Drizzle only (same as login) — avoids raw mysql2 edge cases on some hosts.
   * @param {{ limit: number, offset: number, search?: string, role_slug?: string }} opts
   */
  async listUsers({ limit, offset, search, role_slug: roleSlug }) {
    const searchTerm = search ? String(search).trim() : "";
    const searchPattern = searchTerm ? `%${searchTerm}%` : null;
    const searchWhere = searchPattern
      ? or(
          like(users.email, searchPattern),
          like(users.first_name, searchPattern),
          like(users.last_name, searchPattern),
        )
      : undefined;

    let idFilter = null;
    const slug = roleSlug ? String(roleSlug).trim().toLowerCase() : "";
    if (slug) {
      if (!SLUG_RE.test(slug)) {
        throw new ErrorClass("role_slug must be a valid role slug", 400);
      }
      const [roleRow] = await authDb
        .select({ id: rbacRoles.id })
        .from(rbacRoles)
        .where(eq(rbacRoles.slug, slug))
        .limit(1);
      if (!roleRow) {
        return { count: 0, rows: [] };
      }
      const memberRows = await authDb
        .select({ userId: rbacUserRoles.user_id })
        .from(rbacUserRoles)
        .where(eq(rbacUserRoles.role_id, roleRow.id));
      idFilter = [...new Set(memberRows.map((r) => r.userId))];
      if (idFilter.length === 0) {
        return { count: 0, rows: [] };
      }
    }

    const where =
      idFilter && searchWhere
        ? and(inArray(users.id, idFilter), searchWhere)
        : idFilter
          ? inArray(users.id, idFilter)
          : searchWhere;

    const countQuery = authDb.select({ total: count() }).from(users);
    const [countRow] = await (where ? countQuery.where(where) : countQuery);
    const total = Number(countRow?.total ?? 0);

    const listBase = authDb
      .select({
        id: users.id,
        email: users.email,
        user_key: users.user_key,
        first_name: users.first_name,
        last_name: users.last_name,
        date_created: users.date_created,
        last_login: users.last_login,
      })
      .from(users);
    const listQ = where ? listBase.where(where) : listBase;
    const rows = await listQ.orderBy(desc(users.date_created)).limit(limit).offset(offset);

    const userIds = rows.map((r) => r.id);
    if (userIds.length === 0) {
      return { count: total, rows: [] };
    }

    const roleLinks = await authDb
      .select({
        userId: rbacUserRoles.user_id,
        slug: rbacRoles.slug,
        label: rbacRoles.label,
      })
      .from(rbacUserRoles)
      .innerJoin(rbacRoles, eq(rbacRoles.id, rbacUserRoles.role_id))
      .where(inArray(rbacUserRoles.user_id, userIds));

    const rolesByUser = new Map();
    for (const r of roleLinks) {
      const uid = r.userId;
      if (!rolesByUser.has(uid)) rolesByUser.set(uid, []);
      rolesByUser.get(uid).push({ slug: r.slug, label: r.label });
    }

    const enriched = rows.map((u) => ({
      id: u.id,
      email: u.email,
      user_key: u.user_key,
      first_name: u.first_name,
      last_name: u.last_name,
      date_created: u.date_created,
      last_login: u.last_login,
      roles: rolesByUser.get(u.id) ?? [],
    }));

    return { count: total, rows: enriched };
  }

  async createRole({ slug, label, permission_keys: permissionKeys }) {
    const s = String(slug || "").trim().toLowerCase();
    const l = String(label || "").trim();
    if (!SLUG_RE.test(s)) {
      throw new ErrorClass(
        "slug must be 2–64 chars: lowercase letters, digits, underscore; start with a letter",
        400,
      );
    }
    if (!l) {
      throw new ErrorClass("label is required", 400);
    }

    const [existing] = await authDb
      .select({ id: rbacRoles.id })
      .from(rbacRoles)
      .where(eq(rbacRoles.slug, s))
      .limit(1);
    if (existing) {
      throw new ErrorClass("Role slug already exists", 409);
    }

    const keys = Array.isArray(permissionKeys) ? permissionKeys : [];
    if (keys.includes("*") && s !== "management") {
      throw new ErrorClass("Only the system management role may hold the * permission", 400);
    }

    await authDb.insert(rbacRoles).values({
      slug: s,
      label: l,
      is_system: 0,
      date_created: new Date(),
      date_modified: new Date(),
    });
    const [created] = await authDb
      .select()
      .from(rbacRoles)
      .where(eq(rbacRoles.slug, s))
      .limit(1);

    await this._replaceRolePermissions(created.id, keys);
    return this._roleWithPermissions(created.id);
  }

  async setRolePermissions(roleId, permissionKeys) {
    const id = Number(roleId);
    const [role] = await authDb
      .select()
      .from(rbacRoles)
      .where(eq(rbacRoles.id, id))
      .limit(1);
    if (!role) {
      throw new ErrorClass("Role not found", 404);
    }

    const keys = Array.isArray(permissionKeys) ? permissionKeys : [];

    if (role.slug === ROLES.MANAGEMENT) {
      if (!keys.includes("*")) {
        throw new ErrorClass(
          "The management role must always include the * (full access) permission. Your save was rejected so no admin loses access.",
          400,
        );
      }
      await this._replaceRolePermissions(id, keys);
      const affected = await userIdsForRole(id);
      await bumpTokenVersionForUserIds(affected);
      return this._roleWithPermissions(id);
    }

    if (keys.includes("*")) {
      throw new ErrorClass("The * permission cannot be assigned to custom roles", 400);
    }

    await this._replaceRolePermissions(id, keys);
    const affected = await userIdsForRole(id);
    await bumpTokenVersionForUserIds(affected);
    return this._roleWithPermissions(id);
  }

  async _replaceRolePermissions(roleId, permissionKeys) {
    await authDb.delete(rbacRolePermissions).where(eq(rbacRolePermissions.role_id, roleId));
    if (permissionKeys.length === 0) return;

    const permRows = await authDb
      .select({ id: rbacPermissions.id, key: rbacPermissions.permission_key })
      .from(rbacPermissions)
      .where(inArray(rbacPermissions.permission_key, permissionKeys));
    const found = new Set(permRows.map((p) => p.key));
    const missing = permissionKeys.filter((k) => !found.has(k));
    if (missing.length > 0) {
      throw new ErrorClass(`Unknown permission keys: ${missing.join(", ")}`, 400);
    }

    await authDb.insert(rbacRolePermissions).values(
      permRows.map((p) => ({ role_id: roleId, permission_id: p.id })),
    );
  }

  async _roleWithPermissions(roleId) {
    const [role] = await authDb
      .select()
      .from(rbacRoles)
      .where(eq(rbacRoles.id, roleId))
      .limit(1);
    const perms = await authDb
      .select({ key: rbacPermissions.permission_key })
      .from(rbacRolePermissions)
      .innerJoin(
        rbacPermissions,
        eq(rbacRolePermissions.permission_id, rbacPermissions.id),
      )
      .where(eq(rbacRolePermissions.role_id, roleId));
    return {
      ...role,
      permission_keys: perms.map((p) => p.key),
    };
  }

  async assignUserRole({ targetUserKey, roleSlug, assignedByUserId }) {
    const key = String(targetUserKey || "").trim();
    const slug = String(roleSlug || "").trim().toLowerCase();
    if (!key || !slug) {
      throw new ErrorClass("target user_key and role_slug are required", 400);
    }

    const [target] = await authDb
      .select()
      .from(users)
      .where(eq(users.user_key, key))
      .limit(1);
    if (!target) {
      throw new ErrorClass("User not found", 404);
    }

    const [role] = await authDb
      .select()
      .from(rbacRoles)
      .where(eq(rbacRoles.slug, slug))
      .limit(1);
    if (!role) {
      throw new ErrorClass("Role not found", 404);
    }

    const [existingUr] = await authDb
      .select()
      .from(rbacUserRoles)
      .where(
        and(eq(rbacUserRoles.user_id, target.id), eq(rbacUserRoles.role_id, role.id)),
      )
      .limit(1);

    if (existingUr) {
      await authDb
        .update(rbacUserRoles)
        .set({
          assigned_at: new Date(),
          assigned_by_user_id: assignedByUserId ?? null,
        })
        .where(
          and(eq(rbacUserRoles.user_id, target.id), eq(rbacUserRoles.role_id, role.id)),
        );
    } else {
      await authDb.insert(rbacUserRoles).values({
        user_id: target.id,
        role_id: role.id,
        assigned_at: new Date(),
        assigned_by_user_id: assignedByUserId ?? null,
      });
    }

    clearUserCache(target.user_key);
    await bumpTokenVersionForUserIds([target.id]);
    return loadUserAccess(target.id);
  }

  async revokeUserRole({ targetUserKey, roleSlug }) {
    const key = String(targetUserKey || "").trim();
    const slug = String(roleSlug || "").trim().toLowerCase();
    if (!key || !slug) {
      throw new ErrorClass("target user_key and role_slug are required", 400);
    }

    const [target] = await authDb
      .select()
      .from(users)
      .where(eq(users.user_key, key))
      .limit(1);
    if (!target) {
      throw new ErrorClass("User not found", 404);
    }

    const [role] = await authDb
      .select()
      .from(rbacRoles)
      .where(eq(rbacRoles.slug, slug))
      .limit(1);
    if (!role) {
      throw new ErrorClass("Role not found", 404);
    }

    await authDb
      .delete(rbacUserRoles)
      .where(
        and(eq(rbacUserRoles.user_id, target.id), eq(rbacUserRoles.role_id, role.id)),
      );

    clearUserCache(target.user_key);
    await bumpTokenVersionForUserIds([target.id]);
    return loadUserAccess(target.id);
  }
}
