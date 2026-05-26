import type { ReviewPlacement } from "./constants";
import type { ReviewRecord } from "./constants";
import { listAllReviews } from "./reviews.server";
import { sortStorefrontReviews, type ReviewsSortMode } from "./review-sort.shared";
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
const memoryCache = new Map<string, CacheEntry>();

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
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.reviews;
  }

  let reviews: CachedProxyReview[] | ReviewRecord[];

  if (placement === "homepage") {
    reviews = await getHomepageProxyReviews(admin, sortMode);
  } else {
    const all = await listAllReviews(admin);
    let approved = all.filter((r) => r.status === "approved");
    approved = approved.filter(
      (r) => r.placement === "product" && r.productId === productId,
    );
    reviews = sortStorefrontReviews(approved, sortMode);
  }

  memoryCache.set(key, { reviews, expiresAt: Date.now() + CACHE_TTL_MS });
  return reviews;
}

export function invalidateProxyReviewCache(shop?: string) {
  if (!shop) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`${shop}:`)) memoryCache.delete(key);
  }
}
