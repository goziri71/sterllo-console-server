import ConsoleAuditService, {
  CONSOLE_AUDIT_EVENT,
  UI_AUDIT_EVENT_TYPES,
  recordConsoleAudit,
  ingestUiActivity,
  subscribeConsoleAudit,
} from "../services/consoleAudit.js";
import { parsePagination, paginatedResponse } from "../utils/pagination/index.js";

const auditService = new ConsoleAuditService();

export { CONSOLE_AUDIT_EVENT, recordConsoleAudit };

export const listCommandCenterEvents = async (request, reply) => {
  const { page, limit, offset } = parsePagination(request.query);
  const data = await auditService.listEvents({
    limit,
    offset,
    filters: {
      event_type: request.query.event_type,
      event_prefix: request.query.event_prefix,
      outcome: request.query.outcome,
      actor_user_id: request.query.actor_user_id,
      account_key: request.query.account_key,
      reference: request.query.reference,
      from_date: request.query.from_date,
      to_date: request.query.to_date,
    },
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Command center events fetched successfully",
    ...paginatedResponse(data, page, limit),
  });
};

export const ingestCommandCenterActivity = async (request, reply) => {
  const result = await ingestUiActivity(request, request.body ?? {});
  return reply.code(202).send({
    code: 202,
    success: true,
    message: "Activity recorded",
    data: {
      accepted: result.accepted,
      allowed_event_types: [...UI_AUDIT_EVENT_TYPES],
      events: result.events,
    },
  });
};

export const getCommandCenterPulse = async (request, reply) => {
  const data = await auditService.getPulse({
    windowMinutes: request.query.window_minutes,
  });
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Command center pulse fetched successfully",
    data,
  });
};

export const getCommandCenterPresence = async (request, reply) => {
  const data = await auditService.getPresence({
    limit: Number(request.query.limit) || 40,
  });
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Command center presence fetched successfully",
    data,
  });
};

/**
 * SSE stream of live audit events.
 * Auth: Authorization Bearer OR ?access_token= (EventSource cannot set headers).
 */
export const streamCommandCenter = async (request, reply) => {
  const lastEventId = Number(request.headers["last-event-id"] || request.query.last_event_id || 0);
  const origin = request.headers.origin || "*";

  reply.hijack();
  // Must set CORS here — hijack bypasses @fastify/cors response headers.
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  });
  reply.raw.write(": connected\n\n");

  if (lastEventId > 0) {
    try {
      const backlog = await auditService.listEvents({
        limit: 50,
        offset: 0,
        filters: {},
      });
      const missed = backlog.rows
        .filter((e) => e.id > lastEventId)
        .sort((a, b) => a.id - b.id);
      for (const event of missed) {
        reply.raw.write(`id: ${event.id}\nevent: audit\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch {
      // ignore backlog errors; live stream still works
    }
  }

  const unsubscribe = subscribeConsoleAudit(reply.raw);
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      unsubscribe();
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  request.raw.on("close", cleanup);
  request.raw.on("error", cleanup);
};
