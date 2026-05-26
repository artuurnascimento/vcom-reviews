import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { listAllReviews, getFileImageUrls } from "../lib/reviews.server";
import type { ReviewPlacement } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const placement = (url.searchParams.get("placement") || "homepage") as ReviewPlacement;
    let productId = url.searchParams.get("product_id")?.trim() || "";

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

    const imageIds = approved.flatMap((r) => r.images);
    const imageUrls = await getFileImageUrls(admin, imageIds);

    const ratingSum = approved.reduce((sum, r) => sum + r.rating, 0);
    const count = approved.length;
    const avg = count > 0 ? ratingSum / count : 0;
    const PROXY_MAX_CARDS = 250;

    return json({
      ok: true,
      count,
      avg: Math.round(avg * 10) / 10,
      reviews: approved.slice(0, PROXY_MAX_CARDS).map((r) => ({
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
    return json({ ok: false, reviews: [], count: 0, avg: 0 }, { status: 500 });
  }
};
