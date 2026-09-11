import {
  listCommandCenterEvents,
  ingestCommandCenterActivity,
  getCommandCenterPulse,
  getCommandCenterPresence,
  streamCommandCenter,
} from "../../controllers/ops.js";
import { authenticate, authenticateBearerOrQuery, requirePermission } from "../../middleware/auth.js";
import { PERMISSIONS } from "../../config/permissions.js";

export default async function opsRoutes(fastify) {
  fastify.get(
    "/command-center/events",
    {
      preHandler: [authenticate, requirePermission(PERMISSIONS.CONSOLE_READ)],
    },
    listCommandCenterEvents,
  );

  // Frontend posts clicks / navigation / filters here (batch supported).
  fastify.post(
    "/command-center/activity",
    {
      preHandler: [authenticate, requirePermission(PERMISSIONS.CONSOLE_READ)],
    },
    ingestCommandCenterActivity,
  );

  fastify.get(
    "/command-center/pulse",
    {
      preHandler: [authenticate, requirePermission(PERMISSIONS.CONSOLE_READ)],
    },
    getCommandCenterPulse,
  );

  fastify.get(
    "/command-center/presence",
    {
      preHandler: [authenticate, requirePermission(PERMISSIONS.CONSOLE_READ)],
    },
    getCommandCenterPresence,
  );

  // SSE — EventSource often cannot send Authorization headers; allow ?access_token=
  fastify.get(
    "/command-center/stream",
    {
      preHandler: [authenticateBearerOrQuery, requirePermission(PERMISSIONS.CONSOLE_READ)],
    },
    streamCommandCenter,
  );
}
