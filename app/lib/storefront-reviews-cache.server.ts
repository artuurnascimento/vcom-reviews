type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

import type { ReviewRecord } from "./constants";
import { getFileImageUrls, listAllReviews } from "./reviews.server";
import {
  sortStorefrontReviews,
  type ReviewsSortMode,
} from "./review-sort.shared";
import { STOREFRONT_METAFIELD_NAMESPACE } from "./storefront-settings.server";
import { getStorefrontSettings } from "./storefront-settings.server";

export const STOREFRONT_HOMEPAGE_CACHE_KEY = "homepage_reviews_cache";

export type CachedProxyReview = {
  rating: number;
  verified_buyer: boolean;
  title: string;
  body: string;
  author: string;
  time: string;
  images: string[];
};

export type HomepageReviewsCache = {
  sort: ReviewsSortMode;
  reviews: CachedProxyReview[];
  updated_at: string;
};

function toCachedReview(r: ReviewRecord): CachedProxyReview {
  return {
    rating: r.rating,
    verified_buyer: r.verified_buyer,
    title: r.title,
    body: r.body,
    author: r.author,
    time: r.time,
    images: r.images,
  };
}

export function buildHomepageReviewsCache(
  reviews: ReviewRecord[],
  sort: ReviewsSortMode,
): HomepageReviewsCache {
  let approved = reviews.filter(
    (r) => r.status === "approved" && r.placement === "homepage",
  );
  approved = sortStorefrontReviews(approved, sort);
  return {
    sort,
    reviews: approved.map(toCachedReview),
    updated_at: new Date().toISOString(),
  };
}

/** Inclui URLs de imagem prontas para a vitrine (evita proxy só para fotos). */
export async function buildHomepageReviewsCacheWithImages(
  admin: AdminApi,
  reviews: ReviewRecord[],
  sort: ReviewsSortMode,
): Promise<HomepageReviewsCache> {
  const base = buildHomepageReviewsCache(reviews, sort);
  const fileIds = base.reviews.flatMap((r) => r.images);
  if (fileIds.length === 0) return base;

  let urlMap: Record<string, string> = {};
  try {
    urlMap = await getFileImageUrls(admin, fileIds);
  } catch (error) {
    console.warn("[vcom-reviews] homepage cache image urls", error);
  }

  return {
    ...base,
    reviews: base.reviews.map((r) => ({
      ...r,
      images: r.images.map((id) => urlMap[id]).filter(Boolean),
    })),
  };
}

async function readShopMetafieldCache(
  admin: AdminApi,
): Promise<HomepageReviewsCache | null> {
  const response = await admin.graphql(
    `#graphql
    query HomepageReviewsCache {
      shop {
        metafield(namespace: "${STOREFRONT_METAFIELD_NAMESPACE}", key: "${STOREFRONT_HOMEPAGE_CACHE_KEY}") {
          value
        }
      }
    }`,
  );
  const json = await response.json();
  const raw = json.data?.shop?.metafield?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HomepageReviewsCache;
    if (!parsed || !Array.isArray(parsed.reviews)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveHomepageReviewsCache(
  admin: AdminApi,
  cache: HomepageReviewsCache,
): Promise<void> {
  const shopRes = await admin.graphql(
    `#graphql
    query ShopIdForHomepageCache {
      shop { id }
    }`,
  );
  const shopJson = await shopRes.json();
  const ownerId = shopJson.data?.shop?.id;
  if (!ownerId) return;

  const save = await admin.graphql(
    `#graphql
    mutation SaveHomepageReviewsCache($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: STOREFRONT_METAFIELD_NAMESPACE,
            key: STOREFRONT_HOMEPAGE_CACHE_KEY,
            type: "json",
            value: JSON.stringify(cache),
          },
        ],
      },
    },
  );
  const saveJson = await save.json();
  const errors = saveJson.data?.metafieldsSet?.userErrors || [];
  if (errors.length) {
    console.warn("[vcom-reviews] homepage cache save", errors);
  }
}

/** Lê cache da loja; reconstrói só se ausente ou ordem diferente. */
export async function getHomepageProxyReviews(
  admin: AdminApi,
  sort: ReviewsSortMode,
): Promise<CachedProxyReview[]> {
  const cached = await readShopMetafieldCache(admin);
  if (cached && cached.reviews.length > 0 && cached.sort === sort) {
    return cached.reviews;
  }

  const settings = await getStorefrontSettings(admin);
  const sortToBuild = sort || settings.reviews_sort;
  const all = await listAllReviews(admin);
  const built = await buildHomepageReviewsCacheWithImages(admin, all, sortToBuild);
  await saveHomepageReviewsCache(admin, built);
  return built.reviews;
}
