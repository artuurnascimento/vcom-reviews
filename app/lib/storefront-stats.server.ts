type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

import { invalidateProxyReviewCache } from "./review-proxy-cache.server";
import { publishAllReviewMetaobjects } from "./metaobject-publish.server";
import {
  buildHomepageReviewsCache,
  saveHomepageReviewsCache,
} from "./storefront-reviews-cache.server";
import {
  getStorefrontSettings,
  STOREFRONT_METAFIELD_NAMESPACE,
} from "./storefront-settings.server";
import { listAllReviews } from "./reviews.server";

export const STOREFRONT_STATS_METAFIELD_KEY = "storefront_stats";

export type StorefrontReviewStats = {
  homepage_count: number;
  homepage_avg: number;
  total_approved: number;
  updated_at: string;
};

function roundRating(avg: number): number {
  return Math.round(avg * 10) / 10;
}

export function computeStorefrontReviewStats(
  reviews: Awaited<ReturnType<typeof listAllReviews>>,
): StorefrontReviewStats {
  const approved = reviews.filter((r) => r.status === "approved");
  const homepage = approved.filter((r) => r.placement === "homepage");
  const sum = homepage.reduce((acc, r) => acc + r.rating, 0);
  const homepage_avg =
    homepage.length > 0 ? roundRating(sum / homepage.length) : 0;

  return {
    homepage_count: homepage.length,
    homepage_avg,
    total_approved: approved.length,
    updated_at: new Date().toISOString(),
  };
}

export async function syncStorefrontReviewStats(admin: AdminApi): Promise<void> {
  try {
    try {
      await publishAllReviewMetaobjects(admin);
    } catch (publishError) {
      console.warn("[vcom-reviews] publish before stats sync", publishError);
    }
    const reviews = await listAllReviews(admin);
    const stats = computeStorefrontReviewStats(reviews);
    const settings = await getStorefrontSettings(admin);
    const homepageCache = buildHomepageReviewsCache(reviews, settings.reviews_sort);
    await saveHomepageReviewsCache(admin, homepageCache);

    const shopRes = await admin.graphql(
      `#graphql
      query ShopIdForStats {
        shop { id }
      }`,
    );
    const shopJson = await shopRes.json();
    const ownerId = shopJson.data?.shop?.id;
    if (!ownerId) return;

    const save = await admin.graphql(
      `#graphql
      mutation SaveStorefrontStats($metafields: [MetafieldsSetInput!]!) {
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
              key: STOREFRONT_STATS_METAFIELD_KEY,
              type: "json",
              value: JSON.stringify(stats),
            },
          ],
        },
      },
    );
    const saveJson = await save.json();
    const errors = saveJson.data?.metafieldsSet?.userErrors || [];
    if (errors.length) {
      console.warn("[vcom-reviews] storefront stats save", errors);
    }
    const shopDomain = (
      await admin.graphql(`#graphql query ShopDomainForCache { shop { myshopifyDomain } }`)
    )
      .then((r) => r.json())
      .then((j) => j.data?.shop?.myshopifyDomain as string | undefined)
      .catch(() => undefined);
    invalidateProxyReviewCache(await shopDomain);
  } catch (error) {
    console.error("[vcom-reviews] syncStorefrontReviewStats", error);
  }
}
