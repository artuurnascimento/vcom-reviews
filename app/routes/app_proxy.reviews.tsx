import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "node:crypto";
import { authenticate } from "../shopify.server";
import { getFileImageUrls } from "../lib/reviews.server";
import { getProxyApprovedReviews } from "../lib/review-proxy-cache.server";
import { normalizeReviewsSortMode } from "../lib/review-sort.shared";
import type { ReviewPlacement } from "../lib/constants";
import { incrementCounter, recordRequestMetric } from "../lib/monitoring.server";
import { logError, logWarn } from "../lib/observability.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const started = Date.now();
  const finish = (status: number) => {
    recordRequestMetric("app_proxy.reviews", Date.now() - started, status);
  };
  try {
    let admin: Awaited<ReturnType<typeof authenticate.public.appProxy>>["admin"];
    let session: Awaited<ReturnType<typeof authenticate.public.appProxy>>["session"];
    try {
      ({ admin, session } = await authenticate.public.appProxy(request));
    } catch (authError) {
      incrementCounter("proxy_auth_failures");
      logWarn("app_proxy auth failed", {
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
    const placement = (url.searchParams.get("placement") || "homepage") as ReviewPlacement;
    let productId = url.searchParams.get("product_id")?.trim() || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") || "8", 10) || 8),
    );
    const sort = normalizeReviewsSortMode(url.searchParams.get("sort"));

    if (productId && !productId.startsWith("gid://")) {
      productId = `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
    }

    const approved = await getProxyApprovedReviews(
      admin,
      session.shop,
      placement,
      productId,
      sort,
    );

    const ratingSum = approved.reduce((sum, r) => sum + r.rating, 0);
    const count = approved.length;
    const avg = count > 0 ? ratingSum / count : 0;
    const totalPages = count > 0 ? Math.ceil(count / limit) : 0;
    const start = (page - 1) * limit;
    const pageReviews = approved.slice(start, start + limit);

    let imageUrls: Record<string, string> = {};
    try {
      const imageIds = pageReviews.flatMap((r) => r.images);
      imageUrls = await getFileImageUrls(admin, imageIds);
    } catch (imageError) {
      logWarn("app_proxy image urls failed", {
        error: imageError instanceof Error ? imageError.message : String(imageError),
      });
    }

    const res = json({
      ok: true,
      count,
      avg: Math.round(avg * 10) / 10,
      page,
      limit,
      total_pages: totalPages,
      reviews: pageReviews.map((r) => ({
        rating: r.rating,
        verified_buyer: r.verified_buyer,
        title: r.title,
        body: r.body,
        author: r.author,
        time: r.time,
        images: r.images.map((id) => imageUrls[id]).filter(Boolean),
      })),
    });
    finish(200);
    return res;
  } catch (e) {
    const correlationId = crypto.randomUUID();
    logError("app_proxy reviews error", e, { correlationId });
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
