import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { listAllReviews, getFileImageUrls } from "../lib/reviews.server";
import type { ReviewPlacement } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session) {
      return json(
        {
          ok: false,
          reviews: [],
          count: 0,
          avg: 0,
          error: "Sessão do app indisponível. Abra o app VCOM Reviews no admin da loja.",
        },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const placement = (url.searchParams.get("placement") || "homepage") as ReviewPlacement;
    let productId = url.searchParams.get("product_id")?.trim() || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") || "8", 10) || 8),
    );

    if (productId && !productId.startsWith("gid://")) {
      productId = `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
    }

    const reviews = await listAllReviews(admin);
    let approved = reviews.filter((r) => r.status === "approved");

    if (placement === "homepage") {
      approved = approved.filter((r) => r.placement === "homepage");
    } else {
      approved = approved.filter(
        (r) => r.placement === "product" && r.productId === productId,
      );
    }

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
      console.warn("[vcom-reviews] app_proxy image urls", imageError);
    }

    return json({
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
  } catch (e) {
    console.error("app_proxy reviews error", e);
    let msg = e instanceof Error ? e.message : String(e);
    try {
      const maybeStatus = (e as any)?.status;
      const maybeTextFn = (e as any)?.text;
      if (typeof maybeStatus === "number" && typeof maybeTextFn === "function") {
        const body = await maybeTextFn.call(e);
        msg = `HTTP ${maybeStatus} ${(e as any).statusText || ""}${
          body ? ` - ${String(body).slice(0, 500)}` : ""
        }`;
      } else if (typeof maybeStatus === "number") {
        msg = `HTTP ${maybeStatus} ${(e as any).statusText || ""} - ${String(e)}`;
      }
    } catch {
      // ignore parse error
    }
    return json(
      { ok: false, reviews: [], count: 0, avg: 0, error: msg },
      { status: 500 },
    );
  }
};
