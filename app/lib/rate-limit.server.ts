type RateLimitBucket = {
  hits: number[];
};

const buckets = new Map<string, RateLimitBucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };
  const recentHits = bucket.hits.filter((ts) => ts > windowStart);

  if (recentHits.length >= limit) {
    const oldestWithinWindow = recentHits[0] ?? now;
    const retryAfterMs = Math.max(1000, oldestWithinWindow + windowMs - now);
    buckets.set(key, { hits: recentHits });
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  recentHits.push(now);
  buckets.set(key, { hits: recentHits });
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimits() {
  buckets.clear();
}
