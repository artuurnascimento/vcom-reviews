import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createCustomerPendingReview } from "../lib/reviews.server";
import { resolveImageIdsFromForm } from "../lib/upload.server";
import type { ReviewPlacement } from "../lib/constants";
import { incrementCounter, recordRequestMetric } from "../lib/monitoring.server";
import { logError } from "../lib/observability.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const started = Date.now();
  const finish = (status: number) => {
    recordRequestMetric("app_proxy.submit", Date.now() - started, status);
  };

  if (request.method !== "POST") {
    const res = json({ ok: false, error: "Method not allowed" }, { status: 405 });
    finish(405);
    return res;
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    const form = await request.formData();

    const rating = parseFloat(String(form.get("rating") || "0"));
    const body = String(form.get("body") || "").trim();
    const author = String(form.get("author") || "").trim();
    const title = String(form.get("title") || "").trim();
    const placement = (String(form.get("placement") || "homepage") ||
      "homepage") as ReviewPlacement;
    let productId = String(form.get("product_id") || "").trim() || undefined;

    if (!rating || rating < 0.5) {
      const res = json({ ok: false, error: "Selecione uma nota." }, { status: 400 });
      finish(400);
      return res;
    }
    if (!body || !author) {
      const res = json(
        { ok: false, error: "Nome e texto da avaliação são obrigatórios." },
        { status: 400 },
      );
      finish(400);
      return res;
    }

    if (placement === "product" && !productId) {
      const res = json(
        { ok: false, error: "Produto inválido para esta avaliação." },
        { status: 400 },
      );
      finish(400);
      return res;
    }

    if (productId && !productId.startsWith("gid://")) {
      productId = `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
    }

    const imageFileIds = await resolveImageIdsFromForm(admin, form);

    await createCustomerPendingReview(admin, {
      rating,
      title,
      body,
      author,
      placement,
      productId: placement === "product" ? productId : undefined,
      imageFileIds,
    });

    const res = json({
      ok: true,
      message:
        "Obrigado! Sua avaliação foi enviada e será publicada após aprovação da loja.",
    });
    finish(200);
    return res;
  } catch (e) {
    incrementCounter("proxy_submit_failures");
    logError("app_proxy submit error", e);
    const res = json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "Não foi possível enviar a avaliação.",
      },
      { status: 500 },
    );
    finish(500);
    return res;
  }
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  return json({ ok: true, endpoint: "submit" });
};
