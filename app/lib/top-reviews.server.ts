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

/** Quantas avaliações do mesmo produto entram em cada rodada do rodízio. */
export const TOP_REVIEWS_DEFAULT_PER_ROUND = 1;

export interface TopReviewsOptions {
  sort?: ReviewsSortMode;
  limit?: number;
  /** Máximo de avaliações do mesmo produto. 0 = sem teto. */
  perProductCap?: number;
  /** Intercalar produtos (rodízio) em vez de agrupar todos do mesmo produto. */
  interleave?: boolean;
  /** Avaliações do mesmo produto por rodada (1 = uma de cada, 2 = duas...). */
  perRound?: number;
  /** Se informado, só estes produtos entram no bloco (id numérico ou gid). */
  productIds?: string[];
}

/** Aceita tanto `123` quanto `gid://shopify/Product/123`. */
function numericProductId(value: string): string {
  const match = String(value || "").match(/(\d+)\s*$/);
  return match ? match[1] : String(value || "");
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

  const interleave = options.interleave !== false;
  const perRound = Math.max(
    1,
    Math.round(options.perRound ?? TOP_REVIEWS_DEFAULT_PER_ROUND),
  );

  const approved = await getApprovedProductReviewsByShop(admin, shop);
  // getApprovedProductReviewsByShop já vem em ordem de recência (updated_at desc),
  // então o sort estável preserva a mais recente como desempate.
  let ordered = sortStorefrontReviews(approved, sort);

  // Filtro opcional: só os produtos escolhidos nas configurações do bloco.
  if (options.productIds && options.productIds.length > 0) {
    const allowed = new Set(options.productIds.map(numericProductId));
    const filtered = ordered.filter(
      (r) => r.productId && allowed.has(numericProductId(r.productId)),
    );
    if (filtered.length > 0) ordered = filtered;
  }

  if (!interleave) {
    if (perProductCap <= 0) return ordered.slice(0, limit);
    const perProductCount = new Map<string, number>();
    const seq: ReviewRecord[] = [];
    for (const review of ordered) {
      if (seq.length >= limit) break;
      const key = review.productId || review.id;
      const seen = perProductCount.get(key) ?? 0;
      if (seen >= perProductCap) continue;
      perProductCount.set(key, seen + 1);
      seq.push(review);
    }
    return seq;
  }

  // Rodízio entre produtos: pega `perRound` de cada produto por vez, começando
  // pelos produtos com mais avaliações (representação proporcional).
  const groups = new Map<string, ReviewRecord[]>();
  for (const review of ordered) {
    const key = review.productId || review.id;
    const list = groups.get(key);
    if (list) list.push(review);
    else groups.set(key, [review]);
  }
  const lists = [...groups.values()].sort((a, b) => b.length - a.length);
  const cursors = new Array(lists.length).fill(0);
  const picked: ReviewRecord[] = [];
  let advanced = true;
  while (picked.length < limit && advanced) {
    advanced = false;
    for (let g = 0; g < lists.length && picked.length < limit; g++) {
      for (let n = 0; n < perRound && picked.length < limit; n++) {
        const i = cursors[g];
        if (i >= lists[g].length) break;
        if (perProductCap > 0 && i >= perProductCap) break;
        picked.push(lists[g][i]);
        cursors[g] = i + 1;
        advanced = true;
      }
    }
  }

  // Se o teto por produto deixou o bloco incompleto, completa com as restantes
  // para o grid não ficar com espaço vazio.
  if (picked.length < limit) {
    const chosen = new Set(picked.map((r) => r.id));
    for (const review of ordered) {
      if (picked.length >= limit) break;
      if (chosen.has(review.id)) continue;
      picked.push(review);
    }
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

export interface StoreReviewSummary {
  /** Todas as avaliacoes aprovadas, ja ordenadas. */
  reviews: ReviewRecord[];
  total: number;
  avg: number;
  dist: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Resumo da loja inteira (nota media, total e distribuicao por estrela) usado
 * pelo pop-up "todas as avaliacoes" do rodape.
 */
export async function getStoreReviewSummary(
  admin: AdminApi,
  shop: string,
  sort: ReviewsSortMode = "date_new",
): Promise<StoreReviewSummary> {
  const approved = await getApprovedProductReviewsByShop(admin, shop);
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const review of approved) {
    sum += review.rating;
    // Arredonda (4.8 -> 5 estrelas), como o Trustpilot faz na distribuicao.
    const bucket = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
    dist[bucket] += 1;
  }
  const total = approved.length;
  return {
    reviews: sortStorefrontReviews(approved, sort),
    total,
    avg: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    dist,
  };
}
