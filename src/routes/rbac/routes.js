import {
  listUsers,
  createUser,
  listPermissions,
  listRoles,
  createRole,
  updateRolePermissions,
  assignUserRole,
  revokeUserRole,
} from "../../controllers/rbac.js";
import {
  authenticate,
  requireRbacManage,
  requireRecentMfa,
} from "../../middleware/auth.js";

export default async function rbacRoutes(fastify) {
  const readGuard = { preHandler: [authenticate, requireRbacManage] };
  const writeGuard = {
    preHandler: [authenticate, requireRbacManage, requireRecentMfa],
  };

  fastify.get("/users", readGuard, listUsers);
  fastify.post("/users", writeGuard, createUser);
  fastify.get("/permissions", readGuard, listPermissions);
  fastify.get("/roles", readGuard, listRoles);
  fastify.post("/roles", writeGuard, createRole);
  fastify.patch("/roles/:roleId/permissions", writeGuard, updateRolePermissions);
  fastify.post("/users/:userKey/roles", writeGuard, assignUserRole);
  fastify.delete("/users/:userKey/roles/:roleSlug", writeGuard, revokeUserRole);
}
