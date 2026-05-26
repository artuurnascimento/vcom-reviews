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

/** Por POST (evita timeout 502 no Railway). Acima do limiar, o browser envia vários POSTs. */
export const GENERATE_HTTP_CHUNK_SIZE = 20;
export const GENERATE_HTTP_CHUNK_THRESHOLD = 25;

const GENERATE_ROUTE_DATA_ID = "routes/app.reviews.generate";

function buildGenerateFetchUrl(actionUrl: string): string {
  if (typeof window === "undefined") return actionUrl;
  const url = new URL(actionUrl, window.location.origin);
  url.searchParams.set("_data", GENERATE_ROUTE_DATA_ID);
  return `${url.pathname}${url.search}`;
}

export async function postGenerateReviews(
  actionUrl: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  const res = await fetch(buildGenerateFetchUrl(actionUrl), {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    signal,
    headers: { Accept: "application/json" },
  });

  const text = await res.text();

  if (!res.ok) {
    if (res.status === 502 || res.status === 504) {
      return {
        ok: false,
        error:
          "O servidor demorou demais neste lote (timeout). Aguarde um momento e tente de novo.",
      };
    }
    try {
      const json = JSON.parse(text) as { message?: string; error?: string };
      const msg = json.message || json.error;
      if (msg) return { ok: false, error: String(msg) };
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Erro ${res.status} ao gerar avaliações.` };
  }

  try {
    const data = JSON.parse(text) as unknown;
    if (
      data &&
      typeof data === "object" &&
      "ok" in data &&
      (data as GenerateResult).ok === true &&
      isGenerateSuccess(data)
    ) {
      return data;
    }
    if (data && typeof data === "object" && "ok" in data && !(data as GenerateSuccess).ok) {
      return data as GenerateError;
    }
  } catch {
    /* ignore */
  }

  return { ok: false, error: "Resposta inválida do servidor ao gerar avaliações." };
}

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
