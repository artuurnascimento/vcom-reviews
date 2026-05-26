import type { GeneratedAiReview } from "./ai-review-options";
import type { ReviewPlacement } from "./constants";
import type { ProductSearchResult } from "../components/ProductSearchPicker";

export type ProductPreview = {
  id: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  images: Array<{ url: string; altText: string }>;
};

export function productPreviewFromSearchRow(
  product: ProductSearchResult,
): ProductPreview {
  return {
    id: product.id,
    title: product.title,
    description: "",
    productType: product.productType,
    vendor: "",
    tags: [],
    images: product.imageUrl
      ? [{ url: product.imageUrl, altText: product.imageAlt || product.title }]
      : [],
  };
}

export type GenerateSuccess = {
  ok: true;
  reviews: GeneratedAiReview[];
  ratingMin: number;
  ratingMax: number;
  placement: ReviewPlacement;
  productId: string;
  productTitle?: string;
  usedImages: boolean;
};

export type GenerateError = { ok: false; error: string };
export type GenerateResult = GenerateSuccess | GenerateError;

export function isGenerateSuccess(data: unknown): data is GenerateSuccess {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as GenerateSuccess).ok === true &&
    Array.isArray((data as GenerateSuccess).reviews)
  );
}

export type ProductLoadResult =
  | { ok: true; product: ProductPreview | null }
  | { ok: false; error: string };

export type SearchProductsResult =
  | { ok: true; results: ProductSearchResult[] }
  | { ok: false; error: string };

export type GenerateLoaderData = {
  aiConfigured: boolean;
  shopName: string;
  initialProducts: ProductSearchResult[];
  productsLoadError?: string;
  loaderError?: string;
};
