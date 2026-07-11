/**
 * In-memory rate limiter — không cần Redis, phù hợp single-node.
 * Mỗi key (IP + path) có counter riêng, tự reset sau windowMs.
 */

type RateLimitEntry = { count: number; resetAt: number };

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key);
  });
}, 5 * 60 * 1000);

export type RateLimitConfig = {
  maxRequests: number;  // Số request tối đa
  windowMs: number;     // Trong khoảng thời gian (ms)
};

// Config cho từng nhóm endpoint
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login:    { maxRequests: 5,  windowMs: 60_000 },    // 5 lần/phút
  sync:     { maxRequests: 1,  windowMs: 60_000 },    // 1 lần/phút
  backup:   { maxRequests: 2,  windowMs: 60_000 },    // 2 lần/phút
  settings: { maxRequests: 10, windowMs: 60_000 },    // 10 lần/phút
  chat:     { maxRequests: 20, windowMs: 60_000 },    // 20 lần/phút
  export:   { maxRequests: 5,  windowMs: 60_000 },    // 5 lần/phút
};

/**
 * Kiểm tra rate limit.
 * @returns { allowed: boolean; retryAfterMs: number }
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.count++;
  if (entry.count > config.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Lấy key cho rate limit từ request.
 */
export function getRateLimitKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`;
}
