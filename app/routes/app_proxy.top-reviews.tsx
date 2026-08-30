import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";
import { authenticate } from "../shopify.server";
import { getFileImageUrls } from "../lib/reviews.server";
import {
  getProductCardInfoByIds,
  getTopProductReviews,
  getStoreReviewSummary,
  TOP_REVIEWS_DEFAULT_LIMIT,
  TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP,
  TOP_REVIEWS_MAX_LIMIT,
  type ProductCardInfo,
} from "../lib/top-reviews.server";
import { normalizeReviewsSortMode } from "../lib/review-sort.shared";
import { incrementCounter, recordRequestMetric } from "../lib/monitoring.server";
import { logError, logWarn } from "../lib/observability.server";

function parseIntParam(raw: string | null, fallback: number): number {
  const n = parseInt(raw || "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const started = Date.now();
  const finish = (status: number) => {
    recordRequestMetric("app_proxy.top_reviews", Date.now() - started, status);
  };
  try {
    let admin: Awaited<ReturnType<typeof authenticate.public.appProxy>>["admin"];
    let session: Awaited<ReturnType<typeof authenticate.public.appProxy>>["session"];
    try {
      ({ admin, session } = await authenticate.public.appProxy(request));
    } catch (authError) {
      incrementCounter("proxy_auth_failures");
      logWarn("app_proxy top-reviews auth failed", {
        error: authError instanceof Error ? authError.message : String(authError),
      });
      const res = json(
        {
          ok: false,
          reviews: [],
          count: 0,
          avg: 0,
          error:
            "Sessão do app expirada. Abra o app VCOM Reviews no admin da Shopify e clique em Salvar em Aparência.",
        },
        { status: 503 },
      );
      finish(503);
      return res;
    }
    if (!admin || !session) {
      incrementCounter("proxy_auth_failures");
      const res = json(
        {
          ok: false,
          reviews: [],
          count: 0,
          avg: 0,
          error: "Sessão do app indisponível. Abra o app VCOM Reviews no admin da loja.",
        },
        { status: 503 },
      );
      finish(503);
      return res;
    }

    const url = new URL(request.url);
    const sort = normalizeReviewsSortMode(url.searchParams.get("sort") || "rating_high");
    const total = Math.min(
      TOP_REVIEWS_MAX_LIMIT,
      Math.max(1, parseIntParam(url.searchParams.get("total"), TOP_REVIEWS_DEFAULT_LIMIT)),
    );
    const perProductCap = Math.max(
      0,
      parseIntParam(url.searchParams.get("per_product"), TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP),
    );
    const page = Math.max(1, parseIntParam(url.searchParams.get("page"), 1));
    const limit = Math.min(50, Math.max(1, parseIntParam(url.searchParams.get("limit"), 8)));
    // Rodízio entre produtos (padrão) e quantas do mesmo produto por rodada.
    const interleave = url.searchParams.get("mix") !== "0";
    const perRound = Math.max(1, parseIntParam(url.searchParams.get("per_round"), 1));
    const productIds = (url.searchParams.get("products") || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    // all=1: pop-up "todas as avaliacoes" do rodape — lista completa + distribuicao.
    const wantAll = url.searchParams.get("all") === "1";
    const summary = wantAll
      ? await getStoreReviewSummary(admin, session.shop, "date_new")
      : null;

    const top = summary
      ? summary.reviews
      : await getTopProductReviews(admin, session.shop, {
          sort,
          limit: total,
          perProductCap,
          interleave,
          perRound,
          productIds,
        });

    const ratingSum = top.reduce((sum, r) => sum + r.rating, 0);
    const count = top.length;
    const avg = count > 0 ? ratingSum / count : 0;
    const totalPages = count > 0 ? Math.ceil(count / limit) : 0;
    const start = (page - 1) * limit;
    const pageReviews = top.slice(start, start + limit);

    let imageUrls: Record<string, string> = {};
    try {
      const imageIds = pageReviews.flatMap((r) => r.images);
      imageUrls = await getFileImageUrls(admin, imageIds);
    } catch (imageError) {
      logWarn("app_proxy top-reviews image urls failed", {
        error: imageError instanceof Error ? imageError.message : String(imageError),
      });
    }

    let productInfo: Record<string, ProductCardInfo> = {};
    try {
      const productIds = pageReviews
        .map((r) => r.productId)
        .filter((id): id is string => Boolean(id));
      productInfo = await getProductCardInfoByIds(admin, productIds);
    } catch (productError) {
      logWarn("app_proxy top-reviews product info failed", {
        error: productError instanceof Error ? productError.message : String(productError),
      });
    }

    const res = json({
      ok: true,
      count,
      total: summary ? summary.total : count,
      avg_all: summary ? summary.avg : Math.round(avg * 10) / 10,
      dist: summary ? summary.dist : null,
      avg: Math.round(avg * 10) / 10,
      page,
      limit,
      total_pages: totalPages,
      reviews: pageReviews.map((r) => {
        const info = r.productId ? productInfo[r.productId] : undefined;
        return {
          rating: r.rating,
          verified_buyer: r.verified_buyer,
          title: r.title,
          body: r.body,
          author: r.author,
          time: r.time,
          images: r.images.map((id) => imageUrls[id]).filter(Boolean),
          product: info
            ? {
                title: info.title,
                url: info.handle ? `/products/${info.handle}` : null,
                image: info.image,
              }
            : null,
        };
      }),
    });
    finish(200);
    return res;
  } catch (e) {
    const correlationId = crypto.randomUUID();
    logError("app_proxy top-reviews error", e, { correlationId });
    const res = json(
      {
        ok: false,
        reviews: [],
        count: 0,
        avg: 0,
        error: `Não foi possível carregar as avaliações. Código: ${correlationId}`,
      },
      { status: 500 },
    );
    finish(500);
    return res;
  }
};
