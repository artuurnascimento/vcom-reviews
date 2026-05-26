export type ReviewsSortMode =
  | "photos_first"
  | "rating_high"
  | "rating_low"
  | "text_longest"
  | "text_shortest"
  | "verified_first";

export const DEFAULT_REVIEWS_SORT: ReviewsSortMode = "photos_first";

export const REVIEWS_SORT_OPTIONS: {
  value: ReviewsSortMode;
  label: string;
  helpText: string;
}[] = [
  {
    value: "photos_first",
    label: "Com foto primeiro (padrão)",
    helpText: "Avaliações com imagens aparecem antes das que são só texto. Dentro de cada grupo, maior nota primeiro.",
  },
  {
    value: "rating_high",
    label: "Maior nota",
    helpText: "Ordena da nota mais alta para a mais baixa.",
  },
  {
    value: "rating_low",
    label: "Menor nota",
    helpText: "Ordena da nota mais baixa para a mais alta.",
  },
  {
    value: "text_longest",
    label: "Texto mais longo",
    helpText: "Avaliações com mais texto aparecem primeiro.",
  },
  {
    value: "text_shortest",
    label: "Texto mais curto",
    helpText: "Avaliações com menos texto aparecem primeiro.",
  },
  {
    value: "verified_first",
    label: "Comprador verificado primeiro",
    helpText: "Verified Buyer antes das demais; depois por nota (maior primeiro).",
  },
];

export function normalizeReviewsSortMode(raw: unknown): ReviewsSortMode {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (REVIEWS_SORT_OPTIONS.some((o) => o.value === value)) {
    return value as ReviewsSortMode;
  }
  return DEFAULT_REVIEWS_SORT;
}

export type SortableReview = {
  rating: number;
  body: string;
  images: unknown[];
  verified_buyer: boolean;
};

function reviewHasPhotos(review: SortableReview): boolean {
  if (!Array.isArray(review.images)) return false;
  return review.images.some((img) => img != null && img !== "");
}

function bodyLength(review: SortableReview): number {
  return (review.body || "").trim().length;
}

function compareRatingDesc(a: SortableReview, b: SortableReview): number {
  return (b.rating || 0) - (a.rating || 0);
}

/** Ordena cópia do array — não muta o original. */
export function sortStorefrontReviews<T extends SortableReview>(
  reviews: T[],
  mode: ReviewsSortMode,
): T[] {
  const sorted = [...reviews];

  switch (mode) {
    case "photos_first":
      return sorted.sort((a, b) => {
        const photoDiff = (reviewHasPhotos(b) ? 1 : 0) - (reviewHasPhotos(a) ? 1 : 0);
        if (photoDiff !== 0) return photoDiff;
        return compareRatingDesc(a, b);
      });
    case "rating_high":
      return sorted.sort(compareRatingDesc);
    case "rating_low":
      return sorted.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    case "text_longest":
      return sorted.sort((a, b) => bodyLength(b) - bodyLength(a));
    case "text_shortest":
      return sorted.sort((a, b) => bodyLength(a) - bodyLength(b));
    case "verified_first":
      return sorted.sort((a, b) => {
        const verifiedDiff = (b.verified_buyer ? 1 : 0) - (a.verified_buyer ? 1 : 0);
        if (verifiedDiff !== 0) return verifiedDiff;
        return compareRatingDesc(a, b);
      });
    default:
      return sorted;
  }
}
