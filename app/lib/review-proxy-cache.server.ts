import type { ReviewPlacement } from "./constants";
import type { ReviewRecord } from "./constants";
import { listAllReviews } from "./reviews.server";
import { sortStorefrontReviews, type ReviewsSortMode } from "./review-sort.shared";
import { getStorefrontSettings } from "./storefront-settings.server";

type AdminApi = Parameters<typeof listAllReviews>[0];

type CacheEntry = {
  reviews: ReviewRecord[];
  expiresAt: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(shop: string, placement: ReviewPlacement, productId: string, sort: ReviewsSortMode) {
  return `${shop}:${placement}:${productId || "_"}:${sort}`;
}

export async function getProxyApprovedReviews(
  admin: AdminApi,
  shop: string,
  placement: ReviewPlacement,
  productId: string,
  sortMode?: ReviewsSortMode,
): Promise<ReviewRecord[]> {
  const sort =
    sortMode ?? (await getStorefrontSettings(admin)).reviews_sort;
  const key = cacheKey(shop, placement, productId, sort);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.reviews;
  }

  const all = await listAllReviews(admin);
  let approved = all.filter((r) => r.status === "approved");

  if (placement === "homepage") {
    approved = approved.filter((r) => r.placement === "homepage");
  } else {
    approved = approved.filter(
      (r) => r.placement === "product" && r.productId === productId,
    );
  }

  approved = sortStorefrontReviews(approved, sort);
  cache.set(key, { reviews: approved, expiresAt: Date.now() + CACHE_TTL_MS });
  return approved;
}

export function invalidateProxyReviewCache(shop?: string) {
  if (!shop) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${shop}:`)) cache.delete(key);
  }
}
