/**
 * Pagination utility for Sequelize queries.
 * Extracts page/limit from query params and returns Sequelize-compatible options.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse pagination params from request query
 * @param {object} query - req.query
 * @returns {{ page, limit, offset }}
 */
export function parsePagination(query) {
  let page = parseInt(query.page, 10) || DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;

  if (page < 1) page = DEFAULT_PAGE;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
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
 * Build a standardized paginated response
 * @param {object} data - Sequelize findAndCountAll result { count, rows }
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object}
 */
export function paginatedResponse(data, page, limit) {
  const total = Number(data.count ?? 0);
  const totalPages = Math.ceil(total / limit);

  return {
    records: Array.isArray(data.rows) ? data.rows.map((row) => jsonSafeDeep(row)) : data.rows,
    pagination: {
      total,
      page,
      limit,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}
