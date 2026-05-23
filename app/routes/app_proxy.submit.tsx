import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createCustomerPendingReview } from "../lib/reviews.server";
import { resolveImageIdsFromForm } from "../lib/upload.server";
import type { ReviewPlacement } from "../lib/constants";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405 });
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
      return json({ ok: false, error: "Selecione uma nota." }, { status: 400 });
    }
    if (!body || !author) {
      return json(
        { ok: false, error: "Nome e texto da avaliação são obrigatórios." },
        { status: 400 },
      );
    }

    if (placement === "product" && !productId) {
      return json(
        { ok: false, error: "Produto inválido para esta avaliação." },
        { status: 400 },
      );
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

    return json({
      ok: true,
      message:
        "Obrigado! Sua avaliação foi enviada e será publicada após aprovação da loja.",
    });
  } catch (e) {
    console.error("app_proxy submit error", e);
    return json(
      {
        ok: false,
        error:
          e instanceof Error ? e.message : "Não foi possível enviar a avaliação.",
      },
      { status: 500 },
    );
  }
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  return json({ ok: true, endpoint: "submit" });
};
