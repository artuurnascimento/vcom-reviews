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

/** Temas citados nas avaliacoes (multi-idioma), para o bloco "what people talk about most". */
const REVIEW_THEMES: Array<{ key: string; label: string; words: string[] }> = [
  {
    key: "quality",
    label: "Quality",
    words: ["quality", "qualita", "qualité", "qualite", "calidad", "qualidade", "fabric", "tessuto", "tissu", "tela", "material", "premium"],
  },
  {
    key: "delivery",
    label: "Delivery",
    words: ["delivery", "shipping", "arrived", "arriv", "livraison", "entrega", "envio", "spedizione", "fast", "quick", "rapid", "veloce", "rapide"],
  },
  {
    key: "fit",
    label: "Fit & size",
    words: ["fit", "size", "taglia", "taille", "talla", "tamanho", "vestibilita", "vestibilità", "comfortable", "comoda", "confortable", "confortevole"],
  },
  {
    key: "design",
    label: "Design",
    words: ["design", "colour", "color", "colori", "couleur", "logo", "look", "badge", "stemma", "crest"],
  },
  {
    key: "price",
    label: "Price",
    words: ["price", "prezzo", "prix", "precio", "preco", "preço", "value", "worth", "affordable", "vale"],
  },
];

export interface ReviewTheme {
  key: string;
  label: string;
  count: number;
  sample: string;
}

export interface StoreReviewSummary {
  /** Todas as avaliacoes aprovadas, ja ordenadas. */
  reviews: ReviewRecord[];
  total: number;
  avg: number;
  dist: Record<1 | 2 | 3 | 4 | 5, number>;
  /** Assuntos mais citados, do mais frequente para o menos. */
  themes: ReviewTheme[];
  /** Frase-resumo montada a partir dos numeros reais. */
  summaryText: string;
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
  // Notas sao fracionadas (4.6, 4.7...). Distribui proporcionalmente entre as
  // duas estrelas vizinhas (4.7 = 30% em 4 estrelas + 70% em 5), o que mantem a
  // curva coerente com a media exibida.
  const weights: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const review of approved) {
    sum += review.rating;
    const value = Math.min(5, Math.max(1, review.rating));
    const low = Math.floor(value) as 1 | 2 | 3 | 4 | 5;
    const frac = value - low;
    if (frac <= 0 || low >= 5) {
      weights[low] += 1;
    } else {
      const high = (low + 1) as 2 | 3 | 4 | 5;
      weights[low] += 1 - frac;
      weights[high] += frac;
    }
  }
  const total = approved.length;

  // Arredonda para inteiros sem perder o total (sobra vai para a maior barra).
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const levels: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  let assigned = 0;
  for (const level of levels) {
    dist[level] = Math.round(weights[level]);
    assigned += dist[level];
  }
  if (total > 0 && assigned !== total) {
    const biggest = levels.reduce((a, b) => (weights[a] >= weights[b] ? a : b));
    dist[biggest] = Math.max(0, dist[biggest] + (total - assigned));
  }
  // Temas: conta quantas avaliacoes citam cada assunto e guarda um trecho real.
  const themeHits = REVIEW_THEMES.map((theme) => ({
    key: theme.key,
    label: theme.label,
    count: 0,
    sample: "",
  }));
  for (const review of approved) {
    const text = `${review.title || ""} ${review.body || ""}`.toLowerCase();
    if (!text.trim()) continue;
    REVIEW_THEMES.forEach((theme, i) => {
      if (theme.words.some((w) => text.indexOf(w) !== -1)) {
        themeHits[i].count += 1;
        if (!themeHits[i].sample && review.body) {
          themeHits[i].sample = review.body.slice(0, 160);
        }
      }
    });
  }
  const themes = themeHits.filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

  const avgRounded = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
  const happy = approved.filter((r) => r.rating >= 4).length;
  const happyPct = total > 0 ? Math.round((happy / total) * 100) : 0;
  const topLabels = themes.slice(0, 3).map((t) => t.label.toLowerCase());
  const mentions =
    topLabels.length === 0
      ? ""
      : ` Customers most often mention ${
          topLabels.length === 1
            ? topLabels[0]
            : topLabels.slice(0, -1).join(", ") + " and " + topLabels[topLabels.length - 1]
        }.`;
  const summaryText =
    total === 0
      ? ""
      : `Looking at ${total.toLocaleString("en-US")} reviews, shoppers rate this store ${avgRounded} out of 5, with ${happyPct}% giving it 4 stars or more.${mentions}`;

  return {
    reviews: sortStorefrontReviews(approved, sort),
    total,
    avg: avgRounded,
    dist,
    themes,
    summaryText,
  };
}
