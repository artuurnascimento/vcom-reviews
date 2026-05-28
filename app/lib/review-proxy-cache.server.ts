import type { ReviewPlacement } from "./constants";
import type { ReviewRecord } from "./constants";
import { listAllReviews } from "./reviews.server";
import { sortStorefrontReviews, type ReviewsSortMode } from "./review-sort.shared";
import { redisDeleteByPrefix, redisGet, redisSetEx } from "./redis-cache.server";
import {
  getHomepageProxyReviews,
  type CachedProxyReview,
} from "./storefront-reviews-cache.server";

type AdminApi = Parameters<typeof listAllReviews>[0];

type CacheEntry = {
  reviews: CachedProxyReview[] | ReviewRecord[];
  expiresAt: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_SECONDS = Math.ceil(CACHE_TTL_MS / 1000);
const memoryCache = new Map<string, CacheEntry>();
const productApprovedByShopCache = new Map<string, CacheEntry>();

function cacheKey(shop: string, placement: ReviewPlacement, productId: string, sort: ReviewsSortMode) {
  return `${shop}:${placement}:${productId || "_"}:${sort}`;
}

export async function getProxyApprovedReviews(
  admin: AdminApi,
  shop: string,
  placement: ReviewPlacement,
  productId: string,
  sortMode: ReviewsSortMode,
): Promise<CachedProxyReview[] | ReviewRecord[]> {
  const key = cacheKey(shop, placement, productId, sortMode);

  const redisValue = await redisGet(`proxy:${key}`);
  if (redisValue) {
    try {
      return JSON.parse(redisValue) as CachedProxyReview[] | ReviewRecord[];
    } catch {
      // ignore malformed cache payload
    }
  }

  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.reviews;
  }

  let reviews: CachedProxyReview[] | ReviewRecord[];

  if (placement === "homepage") {
    reviews = await getHomepageProxyReviews(admin, sortMode);
  } else {
    const approvedProductReviews = await getApprovedProductReviewsByShop(admin, shop);
    const approved = approvedProductReviews.filter(
      (r) => r.placement === "product" && r.productId === productId,
    );
    reviews = sortStorefrontReviews(approved, sortMode);
  }

  memoryCache.set(key, { reviews, expiresAt: Date.now() + CACHE_TTL_MS });
  await redisSetEx(`proxy:${key}`, CACHE_TTL_SECONDS, JSON.stringify(reviews));
  return reviews;
}

async function getApprovedProductReviewsByShop(
  admin: AdminApi,
  shop: string,
): Promise<ReviewRecord[]> {
  const cached = productApprovedByShopCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.reviews as ReviewRecord[];
  }

  const redisKey = `proxy:approved_products:${shop}`;
  const redisValue = await redisGet(redisKey);
  if (redisValue) {
    try {
      const parsed = JSON.parse(redisValue) as ReviewRecord[];
      productApprovedByShopCache.set(shop, {
        reviews: parsed,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return parsed;
    } catch {
      // ignore malformed cache payload
    }
  }

  const all = await listAllReviews(admin);
  const approvedProducts = all.filter(
    (r) => r.status === "approved" && r.placement === "product",
  );
  productApprovedByShopCache.set(shop, {
    reviews: approvedProducts,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  await redisSetEx(redisKey, CACHE_TTL_SECONDS, JSON.stringify(approvedProducts));
  return approvedProducts;
}

export async function invalidateProxyReviewCache(shop?: string) {
  if (!shop) {
    memoryCache.clear();
    productApprovedByShopCache.clear();
    await redisDeleteByPrefix("proxy:");
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${shop}:`)) memoryCache.delete(key);
  }
  productApprovedByShopCache.delete(shop);
  await redisDeleteByPrefix(`proxy:${shop}:`);
  await redisDeleteByPrefix(`proxy:approved_products:${shop}`);
}
