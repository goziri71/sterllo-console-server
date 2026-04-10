import {
  listUsers,
  listPermissions,
  listRoles,
  createRole,
  updateRolePermissions,
  assignUserRole,
  revokeUserRole,
} from "../../controllers/rbac.js";
import { authenticate, requireRbacManage } from "../../middleware/auth.js";

export default async function rbacRoutes(fastify) {
  const guard = { preHandler: [authenticate, requireRbacManage] };

  fastify.get("/users", guard, listUsers);
  fastify.get("/permissions", guard, listPermissions);
  fastify.get("/roles", guard, listRoles);
  fastify.post("/roles", guard, createRole);
  fastify.patch("/roles/:roleId/permissions", guard, updateRolePermissions);
  fastify.post("/users/:userKey/roles", guard, assignUserRole);
  fastify.delete("/users/:userKey/roles/:roleSlug", guard, revokeUserRole);
}
