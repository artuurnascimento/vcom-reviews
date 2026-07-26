import type { ReviewRecord } from "./constants";
import { listAllReviews } from "./reviews.server";
import { getProductCardInfoByIds } from "./top-reviews.server";

type AdminApi = Parameters<typeof getProductCardInfoByIds>[0];

export interface ProductReviewGroup {
  productId: string;
  numericId: string;
  title: string;
  handle: string;
  image: string | null;
  count: number;
  avg: number;
  reviews: ReviewRecord[];
}

function numericIdOf(gid: string): string {
  const match = gid.match(/(\d+)\s*$/);
  return match ? match[1] : gid;
}

/**
 * Agrupa todas as avaliações (não rejeitadas) por produto, com nome/imagem
 * resolvidos via Admin GraphQL. Ordena por quantidade de avaliações (desc).
 * Avaliações sem produto (homepage) são ignoradas neste agrupamento.
 */
export async function getReviewsByProduct(
  admin: AdminApi,
): Promise<ProductReviewGroup[]> {
  const all = await listAllReviews(admin);
  const withProduct = all.filter(
    (r) => r.productId && r.status !== "rejected",
  );

  const byId = new Map<string, ReviewRecord[]>();
  for (const review of withProduct) {
    const key = review.productId as string;
    const list = byId.get(key) || [];
    list.push(review);
    byId.set(key, list);
  }

  const ids = [...byId.keys()];
  const info = ids.length ? await getProductCardInfoByIds(admin, ids) : {};

  const groups: ProductReviewGroup[] = ids.map((id) => {
    const reviews = byId.get(id) as ReviewRecord[];
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    const card = info[id];
    return {
      productId: id,
      numericId: numericIdOf(id),
      title: card?.title || `Produto ${numericIdOf(id)}`,
      handle: card?.handle || "",
      image: card?.image || null,
      count: reviews.length,
      avg: reviews.length ? Math.round((sum / reviews.length) * 10) / 10 : 0,
      reviews: reviews.slice().sort((a, b) => {
        // 1) avaliações com foto primeiro
        const aHasPhoto = a.images.length > 0 ? 1 : 0;
        const bHasPhoto = b.images.length > 0 ? 1 : 0;
        if (aHasPhoto !== bHasPhoto) return bHasPhoto - aHasPhoto;
        // 2) nota de 5.0 para baixo
        if (b.rating !== a.rating) return b.rating - a.rating;
        // 3) mais recentes primeiro como desempate
        return a.time < b.time ? 1 : a.time > b.time ? -1 : 0;
      }),
    };
  });

  groups.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  return groups;
}

export async function getProductReviewGroup(
  admin: AdminApi,
  productId: string,
): Promise<ProductReviewGroup | null> {
  const groups = await getReviewsByProduct(admin);
  const target = numericIdOf(productId);
  return groups.find((g) => g.numericId === target) || null;
}
