/**
 * Drizzle wraps failing mysql2 queries in `DrizzleQueryError`; the driver errno/code live on `cause`.
 */
export function errorChain(err) {
  const chain = [];
  const seen = new Set();
  let cur = err;
  while (cur != null && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = cur.cause;
  }
  return chain;
}

export function isMissingMysqlTableError(e) {
  return errorChain(e).some((x) => x?.code === "ER_NO_SUCH_TABLE" || x?.errno === 1146);
}
