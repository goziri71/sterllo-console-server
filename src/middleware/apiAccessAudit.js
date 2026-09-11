import { CONSOLE_AUDIT_EVENT, recordConsoleAudit } from "../services/consoleAudit.js";

const SKIP_PATH_PARTS = [
  "/health",
  "/ops/command-center/stream",
  "/ops/command-center/activity",
  "/ops/command-center/events",
  "/ops/command-center/pulse",
  "/ops/command-center/presence",
];

function shouldSkipApiAudit(request) {
  if (!request?.user) return true;
  if (request.method === "OPTIONS" || request.method === "HEAD") return true;
  const url = String(request.url || "");
  return SKIP_PATH_PARTS.some((part) => url.includes(part));
}

/**
 * Log authenticated API traffic into the command center (non-blocking).
 * Complements frontend UI activity ingest.
 */
export function registerApiAccessAudit(app) {
  app.addHook("onResponse", (request, reply, done) => {
    done();
    if (shouldSkipApiAudit(request)) return;

    const status = reply.statusCode || 0;
    const outcome = status >= 400 ? "failure" : "success";
    const path = String(request.routerPath || request.url || "").split("?")[0];

    // Fire-and-forget — never block the response path.
    void recordConsoleAudit(request, {
      event_type: CONSOLE_AUDIT_EVENT.API_REQUEST,
      outcome,
      target_type: "api",
      target_key: `${request.method} ${path}`,
      summary: `${request.method} ${path} → ${status}`,
      metadata: {
        method: request.method,
        path,
        status_code: status,
        query: request.query || undefined,
      },
    });
  });
}
