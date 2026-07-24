import type { ReviewRecord } from "./constants";
import { getApprovedProductReviewsByShop } from "./review-proxy-cache.server";
import {
  normalizeReviewsSortMode,
  sortStorefrontReviews,
  type ReviewsSortMode,
} from "./review-sort.shared";

type AdminApi = Parameters<typeof getApprovedProductReviewsByShop>[0];

/** "Principais avaliações": por padrão prioriza maior nota. */
export const TOP_REVIEWS_DEFAULT_SORT: ReviewsSortMode = "rating_high";
/** Quantas avaliações o bloco mostra no total. */
export const TOP_REVIEWS_DEFAULT_LIMIT = 12;
export const TOP_REVIEWS_MAX_LIMIT = 50;
/** Teto por produto para o bloco representar vários produtos, não só um. */
export const TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP = 3;

export interface TopReviewsOptions {
  sort?: ReviewsSortMode;
  limit?: number;
  /** Máximo de avaliações do mesmo produto. 0 = sem teto. */
  perProductCap?: number;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number.isFinite(value) ? value : fallback);
  return Math.min(max, Math.max(min, n));
}

/**
 * Junta as avaliações aprovadas de TODOS os produtos e devolve as principais,
 * ordenadas (padrão: maior nota primeiro, desempate pela mais recente) e com um
 * teto opcional por produto para diversificar a vitrine.
 */
export async function getTopProductReviews(
  admin: AdminApi,
  shop: string,
  options: TopReviewsOptions = {},
): Promise<ReviewRecord[]> {
  const sort = normalizeReviewsSortMode(options.sort ?? TOP_REVIEWS_DEFAULT_SORT);
  const limit = clampInt(
    options.limit ?? TOP_REVIEWS_DEFAULT_LIMIT,
    1,
    TOP_REVIEWS_MAX_LIMIT,
    TOP_REVIEWS_DEFAULT_LIMIT,
  );
  const perProductCap =
    options.perProductCap === undefined
      ? TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP
      : Math.max(0, Math.round(options.perProductCap));

  const approved = await getApprovedProductReviewsByShop(admin, shop);
  // getApprovedProductReviewsByShop já vem em ordem de recência (updated_at desc),
  // então o sort estável preserva a mais recente como desempate.
  const ordered = sortStorefrontReviews(approved, sort);

  if (perProductCap <= 0) {
    return ordered.slice(0, limit);
  }

  const perProductCount = new Map<string, number>();
  const picked: ReviewRecord[] = [];
  for (const review of ordered) {
    if (picked.length >= limit) break;
    const key = review.productId || review.id;
    const seen = perProductCount.get(key) ?? 0;
    if (seen >= perProductCap) continue;
    perProductCount.set(key, seen + 1);
    picked.push(review);
  }
  return picked;
}

/** Títulos de produto em lote (para o preview no admin). */
export async function getProductTitlesByIds(
  admin: AdminApi,
  productIds: string[],
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 250);
  if (!ids.length) return {};

  const response = await admin.graphql(
    `#graphql
    query TopReviewsProductTitles($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
        }
      }
    }`,
    { variables: { ids } },
  );
  const json = await response.json();
  const out: Record<string, string> = {};
  for (const node of json.data?.nodes || []) {
    if (node?.id && node.title) out[node.id] = node.title as string;
  }
  return out;
}

export interface ProductCardInfo {
  title: string;
  handle: string;
  image: string | null;
}

/** Nome, handle (URL) e imagem de destaque do produto — para a vitrine na home. */
export async function getProductCardInfoByIds(
  admin: AdminApi,
  productIds: string[],
): Promise<Record<string, ProductCardInfo>> {
  const ids = Array.from(new Set(productIds.filter(Boolean))).slice(0, 250);
  if (!ids.length) return {};

  const response = await admin.graphql(
    `#graphql
    query TopReviewsProductCards($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          handle
          featuredImage { url }
        }
      }
    }`,
    { variables: { ids } },
  );
  const json = await response.json();
  const out: Record<string, ProductCardInfo> = {};
  for (const node of json.data?.nodes || []) {
    if (node?.id) {
      out[node.id] = {
        title: (node.title as string) || "",
        handle: (node.handle as string) || "",
        image: node.featuredImage?.url || null,
      };
    }
  }
  return out;
}
