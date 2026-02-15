const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * In-memory rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * Default: 100 requests per hour.
 * Search/chat: 10 requests per minute.
 */
export function rateLimit(
  userId: string,
  limit = 100,
  windowMs = 3600000
): boolean {
  const now = Date.now();
  const key = `${userId}:${limit}:${windowMs}`;
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}

/** Rate limit for general API calls: 100/hour */
export function rateLimitGeneral(userId: string): boolean {
  return rateLimit(userId, 100, 3600000);
}

/** Rate limit for search/chat: 10/minute */
export function rateLimitSearch(userId: string): boolean {
  return rateLimit(userId, 10, 60000);
}
