import RbacService from "../services/rbac.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const rbacService = new RbacService();

const ok = (reply, data) =>
  reply.code(200).send({
    code: 2000,
    state: true,
    message: "Successful.",
    data,
  });

export const listUsers = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await rbacService.listUsers({
    limit,
    offset,
    search: request.query.search,
    role_slug: request.query.role_slug,
  });
  return ok(reply, {
    ...paginatedResponse(data, page, limit),
  });
};

export const createUser = async (request, reply) => {
  const body = request.body || {};
  const created = await rbacService.createConsoleUser({
    email: body.email,
    biller_id: body.biller_id,
    first_name: body.first_name,
    last_name: body.last_name,
    role_slug: body.role_slug,
    assignedByUserId: request.user.id,
  });
  return reply.code(201).send({
    code: 201,
    state: true,
    message: "Console user provisioned successfully",
    data: created,
  });
};

export const listPermissions = async (request, reply) => {
  const rows = await rbacService.listPermissions();
  return ok(reply, rows);
};

export const listRoles = async (request, reply) => {
  const rows = await rbacService.listRoles();
  return ok(reply, rows);
};

export const createRole = async (request, reply) => {
  const body = request.body || {};
  const created = await rbacService.createRole({
    slug: body.slug,
    label: body.label,
    permission_keys: body.permission_keys,
  });
  return ok(reply, created);
};

export const updateRolePermissions = async (request, reply) => {
  const roleId = request.params.roleId;
  const body = request.body || {};
  const updated = await rbacService.setRolePermissions(roleId, body.permission_keys);
  return ok(reply, updated);
};

export const assignUserRole = async (request, reply) => {
  const targetUserKey = request.params.userKey;
  const body = request.body || {};
  const access = await rbacService.assignUserRole({
    targetUserKey,
    roleSlug: body.role_slug,
    assignedByUserId: request.user.id,
  });
  return ok(reply, access);
};

export const revokeUserRole = async (request, reply) => {
  const { userKey, roleSlug } = request.params;
  const access = await rbacService.revokeUserRole({
    targetUserKey: userKey,
    roleSlug,
  });
  return ok(reply, access);
};
