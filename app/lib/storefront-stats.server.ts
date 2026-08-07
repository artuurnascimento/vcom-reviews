type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

import { invalidateProxyReviewCache } from "./review-proxy-cache.server";
import { publishAllReviewMetaobjects } from "./metaobject-publish.server";
import {
  buildHomepageReviewsCacheWithImages,
  saveHomepageReviewsCache,
} from "./storefront-reviews-cache.server";
import {
  getStorefrontSettings,
  STOREFRONT_METAFIELD_NAMESPACE,
} from "./storefront-settings.server";
import { listAllReviews } from "./reviews.server";
import { logError, logWarn } from "./observability.server";

export const STOREFRONT_STATS_METAFIELD_KEY = "storefront_stats";

export type StorefrontReviewStats = {
  homepage_count: number;
  homepage_avg: number;
  // Média/quantidade de TODAS as avaliações aprovadas (produto + página inicial).
  all_count: number;
  all_avg: number;
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

  // Média/quantidade do site inteiro (todas as aprovadas, produto + página inicial).
  const allSum = approved.reduce((acc, r) => acc + r.rating, 0);
  const all_avg = approved.length > 0 ? roundRating(allSum / approved.length) : 0;

  return {
    homepage_count: homepage.length,
    homepage_avg,
    all_count: approved.length,
    all_avg,
    total_approved: approved.length,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Grava, por produto, os metafields PADRÃO de avaliação do Shopify
 * (`reviews.rating` + `reviews.rating_count`), que os cards de coleção do tema
 * leem para exibir as estrelas. Considera apenas avaliações aprovadas.
 */
export async function syncProductRatingMetafields(
  admin: AdminApi,
  reviews: Awaited<ReturnType<typeof listAllReviews>>,
): Promise<void> {
  const byProduct = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    if (r.status !== "approved" || !r.productId) continue;
    const cur = byProduct.get(r.productId) || { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    byProduct.set(r.productId, cur);
  }
  if (byProduct.size === 0) return;

  const metafields: Array<Record<string, string>> = [];
  for (const [ownerId, { sum, count }] of byProduct) {
    const avg = roundRating(sum / count);
    metafields.push({
      ownerId,
      namespace: "reviews",
      key: "rating",
      type: "rating",
      value: JSON.stringify({
        value: avg.toFixed(1),
        scale_min: "1.0",
        scale_max: "5.0",
      }),
    });
    metafields.push({
      ownerId,
      namespace: "reviews",
      key: "rating_count",
      type: "number_integer",
      value: String(count),
    });
  }

  const mutation = `#graphql
    mutation SaveProductRatings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`;

  for (let i = 0; i < metafields.length; i += 25) {
    const chunk = metafields.slice(i, i + 25);
    try {
      const res = await admin.graphql(mutation, {
        variables: { metafields: chunk },
      });
      const j = await res.json();
      const errs = j.data?.metafieldsSet?.userErrors || [];
      if (errs.length) {
        logWarn("product rating metafields save failed", { errors: errs });
      }
    } catch (e) {
      logWarn("product rating metafields chunk error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Coalesce por requisição: salvar N avaliações chamava este sync N vezes, e
 * cada execução varre todas as avaliações e grava metafields — a Admin API
 * responde `Throttled`. Aqui roda uma vez agora e, se chegaram novas chamadas
 * durante a execução, apenas mais uma no fim (para não perder as últimas).
 */
type SyncState = { running: Promise<void>; queued: boolean };
const syncStateByAdmin = new WeakMap<object, SyncState>();

export async function syncStorefrontReviewStats(admin: AdminApi): Promise<void> {
  const key = admin as unknown as object;
  const existing = syncStateByAdmin.get(key);
  if (existing) {
    existing.queued = true;
    return existing.running;
  }

  const state: SyncState = { running: Promise.resolve(), queued: false };
  syncStateByAdmin.set(key, state);
  state.running = (async () => {
    for (;;) {
      state.queued = false;
      await syncStorefrontReviewStatsOnce(admin);
      if (!state.queued) break;
    }
  })();
  return state.running;
}

async function syncStorefrontReviewStatsOnce(admin: AdminApi): Promise<void> {
  try {
    try {
      await publishAllReviewMetaobjects(admin);
    } catch (publishError) {
      logWarn("publish before stats sync failed", {
        error: publishError instanceof Error ? publishError.message : String(publishError),
      });
    }
    const reviews = await listAllReviews(admin);
    const stats = computeStorefrontReviewStats(reviews);
    await syncProductRatingMetafields(admin, reviews).catch((e) =>
      logWarn("syncProductRatingMetafields failed", {
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    const settings = await getStorefrontSettings(admin);
    const homepageCache = await buildHomepageReviewsCacheWithImages(
      admin,
      reviews,
      settings.reviews_sort,
    );
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
      logWarn("storefront stats save failed", { errors });
    }
    const shopDomainResponse = await admin
      .graphql(`#graphql query ShopDomainForCache { shop { myshopifyDomain } }`)
      .catch(() => null);
    const shopDomain = shopDomainResponse
      ? ((await shopDomainResponse.json())?.data?.shop?.myshopifyDomain as string | undefined)
      : undefined;
    await invalidateProxyReviewCache(shopDomain);
  } catch (error) {
    logError("syncStorefrontReviewStats failed", error);
  }
}
