import type { ReviewPlacement } from "./constants";
import type { ReviewRecord } from "./constants";
import { redisDeleteByPrefix, redisGet, redisSetEx } from "./redis-cache.server";
import { listAllReviews } from "./reviews.server";

type AdminApi = Parameters<typeof listAllReviews>[0];

export type ReviewDedupeInput = {
  placement: ReviewPlacement;
  productId?: string;
  author: string;
  title: string;
  body: string;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Chave estável para detectar a mesma avaliação (re-salvar após throttle). */
export function reviewDedupeKey(input: ReviewDedupeInput): string {
  return [
    input.placement,
    input.productId || "",
    normalizeText(input.author),
    normalizeText(input.title),
    normalizeText(input.body),
  ].join("\x1f");
}

export function buildReviewDedupeSet(
  reviews: ReviewRecord[],
  placement: ReviewPlacement,
  productId?: string,
): Set<string> {
  const keys = new Set<string>();
  for (const review of reviews) {
    if (review.placement !== placement) continue;
    if (placement === "product" && review.productId !== productId) continue;
    keys.add(
      reviewDedupeKey({
        placement: review.placement,
        productId: review.productId,
        author: review.author,
        title: review.title,
        body: review.body,
      }),
    );
  }
  return keys;
}

type CacheEntry = {
  keys: Set<string>;
  expiresAt: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_SECONDS = Math.ceil(CACHE_TTL_MS / 1000);
const cache = new Map<string, CacheEntry>();

function cacheKey(shop: string, placement: ReviewPlacement, productId: string) {
  return `${shop}:${placement}:${productId || "_"}`;
}

export async function getReviewDedupeKeys(
  admin: AdminApi,
  shop: string,
  placement: ReviewPlacement,
  productId?: string,
): Promise<Set<string>> {
  const key = cacheKey(shop, placement, productId || "");
  const redisValue = await redisGet(`dedupe:${key}`);
  if (redisValue) {
    try {
      return new Set(JSON.parse(redisValue) as string[]);
    } catch {
      // ignore malformed cache payload
    }
  }

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return new Set(hit.keys);
  }

  const all = await listAllReviews(admin);
  const keys = buildReviewDedupeSet(all, placement, productId);
  cache.set(key, { keys: new Set(keys), expiresAt: Date.now() + CACHE_TTL_MS });
  await redisSetEx(`dedupe:${key}`, CACHE_TTL_SECONDS, JSON.stringify([...keys]));
  return keys;
}

export function rememberReviewDedupeKey(
  shop: string,
  placement: ReviewPlacement,
  productId: string | undefined,
  input: ReviewDedupeInput,
): void {
  const key = cacheKey(shop, placement, productId || "");
  const hit = cache.get(key);
  const dedupeKey = reviewDedupeKey(input);
  if (hit) {
    hit.keys.add(dedupeKey);
    void redisSetEx(`dedupe:${key}`, CACHE_TTL_SECONDS, JSON.stringify([...hit.keys]));
    return;
  }
  const fresh = {
    keys: new Set([dedupeKey]),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  cache.set(key, fresh);
  void redisSetEx(`dedupe:${key}`, CACHE_TTL_SECONDS, JSON.stringify([...fresh.keys]));
}

export function invalidateReviewDedupeCache(shop?: string) {
  if (!shop) {
    cache.clear();
    void redisDeleteByPrefix("dedupe:");
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${shop}:`)) cache.delete(key);
  }
  void redisDeleteByPrefix(`dedupe:${shop}:`);
}
