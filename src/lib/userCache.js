import { base44 } from "@/api/base44Client";

// Shared cache for base44.auth.me() to avoid rate limiting
let cachedUser = null;
let cacheTime = 0;
let pendingRequest = null;

const CACHE_TTL = 5000; // 5 seconds

/**
 * Get the current user with caching.
 * Multiple simultaneous calls will share a single request.
 * @param {boolean} forceRefresh - bypass cache
 * @returns {Promise<object>} user object
 */
export async function getCachedUser(forceRefresh = false) {
  const now = Date.now();

  // Return cached if fresh enough
  if (!forceRefresh && cachedUser && (now - cacheTime) < CACHE_TTL) {
    return cachedUser;
  }

  // If there's already a pending request, wait for it
  if (pendingRequest) {
    return pendingRequest;
  }

  // Make a new request and cache the promise
  pendingRequest = base44.auth.me().then(user => {
    cachedUser = user;
    cacheTime = Date.now();
    pendingRequest = null;
    return user;
  }).catch(err => {
    pendingRequest = null;
    throw err;
  });

  return pendingRequest;
}

/**
 * Invalidate the cache (call after updateMe)
 */
export function invalidateUserCache() {
  cachedUser = null;
  cacheTime = 0;
}

/**
 * Update cached user data locally (call after updateMe to keep cache fresh)
 */
export function updateCachedUser(partialData) {
  if (cachedUser) {
    cachedUser = { ...cachedUser, ...partialData };
    cacheTime = Date.now();
  }
}