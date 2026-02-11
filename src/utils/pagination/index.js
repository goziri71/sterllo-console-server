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

/**
 * Build a standardized paginated response
 * @param {object} data - Sequelize findAndCountAll result { count, rows }
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object}
 */
export function paginatedResponse(data, page, limit) {
  const totalPages = Math.ceil(data.count / limit);

  return {
    records: data.rows,
    pagination: {
      total: data.count,
      page,
      limit,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}
