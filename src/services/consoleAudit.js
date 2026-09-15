import { and, desc, eq, gte, gt, isNull, like, lt, sql } from "drizzle-orm";
import { authDb } from "../db/index.js";
import { consoleAuditEvents } from "../db/schema/consoleAudit.js";
import { authSessions } from "../db/schema/authSecurity.js";
import { users } from "../db/schema/users.js";
import { loadUserAccess } from "./rbac.js";
import { pickPrimaryRoleSlug } from "../config/roles.js";
import { ErrorClass } from "../utils/errorClass/index.js";

/** Canonical event types for the live command center. */
export const CONSOLE_AUDIT_EVENT = Object.freeze({
  TX_APPROVE: "transaction.approve",
  TX_CANCEL: "transaction.cancel",
  WEBHOOK_REPLAY: "deposit.webhook_replay",
  BEAMER_LINK: "beamer.account_link",
  BEAMER_UPDATE: "beamer.account_update",
  BEAMER_NGN_TSQ: "beamer.ngn_tsq",
  RBAC_ROLE_PERMISSIONS: "rbac.role_permissions_updated",
  RBAC_USER_ROLE_ASSIGN: "rbac.user_role_assigned",
  RBAC_USER_ROLE_REVOKE: "rbac.user_role_revoked",
  RBAC_USER_CREATE: "rbac.user_created",
  API_REQUEST: "api.request",
  // Frontend UI activity (ingest)
  UI_PAGE_VIEW: "ui.page_view",
  UI_NAVIGATION: "ui.navigation",
  UI_CLICK: "ui.click",
  UI_FILTER: "ui.filter",
  UI_SEARCH: "ui.search",
  UI_TAB_CHANGE: "ui.tab_change",
  UI_MODAL_OPEN: "ui.modal_open",
  UI_MODAL_CLOSE: "ui.modal_close",
  UI_FORM_SUBMIT: "ui.form_submit",
  UI_COPY: "ui.copy",
  UI_EXPORT: "ui.export",
  UI_SELECTION: "ui.selection",
});

/** Allowed UI event types from the browser ingest endpoint. */
export const UI_AUDIT_EVENT_TYPES = new Set([
  CONSOLE_AUDIT_EVENT.UI_PAGE_VIEW,
  CONSOLE_AUDIT_EVENT.UI_NAVIGATION,
  CONSOLE_AUDIT_EVENT.UI_CLICK,
  CONSOLE_AUDIT_EVENT.UI_FILTER,
  CONSOLE_AUDIT_EVENT.UI_SEARCH,
  CONSOLE_AUDIT_EVENT.UI_TAB_CHANGE,
  CONSOLE_AUDIT_EVENT.UI_MODAL_OPEN,
  CONSOLE_AUDIT_EVENT.UI_MODAL_CLOSE,
  CONSOLE_AUDIT_EVENT.UI_FORM_SUBMIT,
  CONSOLE_AUDIT_EVENT.UI_COPY,
  CONSOLE_AUDIT_EVENT.UI_EXPORT,
  CONSOLE_AUDIT_EVENT.UI_SELECTION,
]);

const MAX_UI_BATCH = 40;

const subscribers = new Set();

function trimStr(value, max = 512) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function actorName(user) {
  const parts = [user?.first_name, user?.last_name].filter(Boolean);
  const name = parts.join(" ").trim();
  return name || user?.email || null;
}

function requestMeta(request) {
  return {
    ip_address: trimStr(request?.ip, 64),
    user_agent: trimStr(request?.headers?.["user-agent"], 512),
    session_id: request?.authSession?.id || request?.user?.sid || null,
  };
}

function shapeEvent(row) {
  let metadata = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch {
      metadata = { raw: row.metadata_json };
    }
  }
  return {
    id: Number(row.id),
    event_type: row.event_type,
    outcome: row.outcome,
    actor: {
      user_id: row.actor_user_id,
      user_key: row.actor_user_key,
      email: row.actor_email,
      role: row.actor_role,
      name: row.actor_name,
    },
    session_id: row.session_id,
    target_type: row.target_type,
    target_key: row.target_key,
    account_key: row.account_key,
    reference: row.reference,
    summary: row.summary,
    metadata,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    date_created: row.date_created,
  };
}

function broadcast(event) {
  const payload = `id: ${event.id}\nevent: audit\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of subscribers) {
    try {
      client.write(payload);
    } catch {
      subscribers.delete(client);
    }
  }
}

export function subscribeConsoleAudit(replyRaw) {
  subscribers.add(replyRaw);
  return () => subscribers.delete(replyRaw);
}

export function consoleAuditSubscriberCount() {
  return subscribers.size;
}

/**
 * Persist + broadcast a command-center event.
 * Never throws to callers — logging must not break product flows.
 */
export async function recordConsoleAudit(request, input = {}) {
  try {
    const user = request?.user || {};
    const meta = requestMeta(request);
    const now = new Date();
    const eventType = trimStr(input.event_type, 64) || "unknown";
    const outcome = trimStr(input.outcome, 20) || "success";
    const summary =
      trimStr(input.summary, 512) ||
      `${eventType} by ${user.email || user.user_key || "unknown"}`;

    const values = {
      event_type: eventType,
      outcome,
      actor_user_id: user.id ?? null,
      actor_user_key: trimStr(user.user_key, 128),
      actor_email: trimStr(user.email, 255),
      actor_role: trimStr(user.role || pickPrimaryRoleSlug(user.roleSlugs), 64),
      actor_name: trimStr(actorName(user), 255),
      session_id: trimStr(meta.session_id, 64),
      target_type: trimStr(input.target_type, 64),
      target_key: trimStr(input.target_key, 255),
      account_key: trimStr(input.account_key, 128),
      reference: trimStr(input.reference, 255),
      summary,
      metadata_json: input.metadata != null ? JSON.stringify(input.metadata) : null,
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
      date_created: now,
    };

    const inserted = await authDb.insert(consoleAuditEvents).values(values);
    const insertId = Number(inserted?.[0]?.insertId || 0);
    const shaped = shapeEvent({ ...values, id: insertId });
    broadcast(shaped);
    return shaped;
  } catch (error) {
    console.warn("[console-audit] failed to record event", error?.message || error);
    return null;
  }
}

/**
 * Ingest browser UI activity (clicks, navigation, filters, etc.).
 * Accepts one event or `{ events: [...] }` (max 40). Rejects mouse-move spam types.
 */
export async function ingestUiActivity(request, payload = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  let items = [];
  if (Array.isArray(body.events)) {
    items = body.events;
  } else if (body.event_type) {
    items = [body];
  } else {
    throw new ErrorClass("Provide event_type or events[]", 400);
  }

  if (items.length === 0) {
    throw new ErrorClass("events cannot be empty", 400);
  }
  if (items.length > MAX_UI_BATCH) {
    throw new ErrorClass(`Max ${MAX_UI_BATCH} events per request`, 400);
  }

  const recorded = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const eventType = trimStr(raw.event_type, 64);
    if (!eventType || !UI_AUDIT_EVENT_TYPES.has(eventType)) {
      throw new ErrorClass(
        `Invalid UI event_type "${eventType || ""}". Allowed: ${[...UI_AUDIT_EVENT_TYPES].join(", ")}`,
        400,
      );
    }

    const path = trimStr(raw.path || raw.route || raw.page, 255);
    const label = trimStr(raw.label || raw.name || raw.text, 255);
    const summary =
      trimStr(raw.summary, 512) ||
      [eventType, label, path].filter(Boolean).join(" — ");

    const metadata = {
      ...(raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {}),
      path: path || undefined,
      label: label || undefined,
      href: trimStr(raw.href, 512) || undefined,
      element: trimStr(raw.element || raw.element_id || raw.target, 255) || undefined,
      component: trimStr(raw.component, 128) || undefined,
      client_ts: raw.client_ts || raw.timestamp || undefined,
    };

    const shaped = await recordConsoleAudit(request, {
      event_type: eventType,
      outcome: trimStr(raw.outcome, 20) || "success",
      target_type: trimStr(raw.target_type, 64) || "ui",
      target_key: trimStr(raw.target_key, 255) || path,
      account_key: trimStr(raw.account_key, 128),
      reference: trimStr(raw.reference, 255),
      summary,
      metadata,
    });
    if (shaped) recorded.push(shaped);
  }

  return { accepted: recorded.length, events: recorded };
}

export default class ConsoleAuditService {
  async listEvents({ limit = 50, offset = 0, filters = {} } = {}) {
    const conditions = [];
    if (filters.event_type) {
      conditions.push(eq(consoleAuditEvents.event_type, String(filters.event_type).trim()));
    }
    if (filters.event_prefix) {
      conditions.push(like(consoleAuditEvents.event_type, `${String(filters.event_prefix).trim()}%`));
    }
    if (filters.outcome) {
      conditions.push(eq(consoleAuditEvents.outcome, String(filters.outcome).trim()));
    }
    if (filters.actor_user_id) {
      conditions.push(eq(consoleAuditEvents.actor_user_id, Number(filters.actor_user_id)));
    }
    if (filters.account_key) {
      conditions.push(eq(consoleAuditEvents.account_key, String(filters.account_key).trim()));
    }
    if (filters.reference) {
      conditions.push(eq(consoleAuditEvents.reference, String(filters.reference).trim()));
    }
    if (filters.from_date) {
      conditions.push(gte(consoleAuditEvents.date_created, new Date(filters.from_date)));
    }
    if (filters.to_date) {
      conditions.push(lt(consoleAuditEvents.date_created, new Date(filters.to_date)));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await authDb
      .select()
      .from(consoleAuditEvents)
      .where(where)
      .orderBy(desc(consoleAuditEvents.id))
      .limit(limit)
      .offset(offset);

    return {
      rows: rows.map(shapeEvent),
    };
  }

  async getPulse({ windowMinutes = 60 } = {}) {
    const minutes = Math.min(Math.max(Number(windowMinutes) || 60, 1), 24 * 60);
    const since = new Date(Date.now() - minutes * 60 * 1000);

    const [rows] = await authDb.execute(sql`
      SELECT
        event_type,
        outcome,
        COUNT(*) AS total
      FROM console_audit_events
      WHERE date_created >= ${since}
      GROUP BY event_type, outcome
    `);

    const byType = {};
    let success = 0;
    let failure = 0;
    let total = 0;
    for (const row of rows || []) {
      const type = row.event_type;
      const outcome = String(row.outcome || "").toLowerCase();
      const n = Number(row.total || 0);
      if (!byType[type]) byType[type] = { success: 0, failure: 0, total: 0 };
      byType[type].total += n;
      if (outcome === "failure" || outcome === "failed" || outcome === "error") {
        byType[type].failure += n;
        failure += n;
      } else {
        byType[type].success += n;
        success += n;
      }
      total += n;
    }

    return {
      window_minutes: minutes,
      since,
      total,
      success,
      failure,
      live_subscribers: consoleAuditSubscriberCount(),
      by_type: byType,
    };
  }

  async getPresence({ limit = 40 } = {}) {
    const now = new Date();
    const rows = await authDb
      .select({
        session_id: authSessions.id,
        user_id: authSessions.user_id,
        last_seen_at: authSessions.last_seen_at,
        device_label: authSessions.device_label,
        ip_address: authSessions.ip_address,
        email: users.email,
        first_name: users.first_name,
        last_name: users.last_name,
        user_key: users.user_key,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.user_id))
      .where(and(isNull(authSessions.revoked_at), gt(authSessions.expires_at, now)))
      .orderBy(desc(authSessions.last_seen_at))
      .limit(limit);

    const out = [];
    for (const row of rows) {
      const access = await loadUserAccess(row.user_id);
      out.push({
        session_id: row.session_id,
        user_id: row.user_id,
        user_key: row.user_key,
        email: row.email,
        name: actorName(row),
        role: pickPrimaryRoleSlug(access.roleSlugs),
        last_seen_at: row.last_seen_at,
        device_label: row.device_label,
        ip_address: row.ip_address,
      });
    }
    return out;
  }
}
