/**
 * Pagination helpers — next/prev only (no expensive COUNT totals).
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse pagination params from request query.
 * `fetchLimit` is limit+1 so callers can detect has_next without COUNT(*).
 * @param {object} query - req.query
 * @returns {{ page, limit, offset, fetchLimit }}
 */
export function parsePagination(query) {
  let page = parseInt(query.page, 10) || DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;

  if (page < 1) page = DEFAULT_PAGE;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const offset = (page - 1) * limit;

  return { page, limit, offset, fetchLimit: limit + 1 };
}

/** Avoid Fastify/JSON `Do not know how to serialize a BigInt` on aggregated IDs etc. */
function jsonSafeDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map((item) => jsonSafeDeep(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = jsonSafeDeep(v);
    }
    return out;
  }
  return value;
}

/**
 * Build a next-only paginated response.
 * Pass service rows fetched with `fetchLimit` (limit + 1).
 * Does not return total / total_pages (avoids COUNT on large tables).
 *
 * @param {object} data - { rows }
 * @param {number} page
 * @param {number} limit - page size (not fetchLimit)
 */
export function paginatedResponse(data, page, limit) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const has_next = rows.length > limit;
  const pageRows = has_next ? rows.slice(0, limit) : rows;

  return {
    records: pageRows.map((row) => jsonSafeDeep(row)),
    pagination: {
      page,
      limit,
      has_next,
      has_prev: page > 1,
    },
  };
}
