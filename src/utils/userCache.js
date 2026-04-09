const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCachedUser(userKey) {
  const entry = userCache.get(userKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    userCache.delete(userKey);
    return null;
  }
  return entry.user;
}

export function setCachedUser(userKey, user) {
  userCache.set(userKey, { user, cachedAt: Date.now() });
}

export function clearUserCache(userKey) {
  if (userKey) {
    userCache.delete(userKey);
  } else {
    userCache.clear();
  }
}
