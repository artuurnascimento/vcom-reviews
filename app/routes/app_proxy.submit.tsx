import crypto from "node:crypto";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { createCustomerPendingReview } from "../lib/reviews.server";
import { resolveImageIdsFromForm } from "../lib/upload.server";
import type { ReviewPlacement } from "../lib/constants";
import { incrementCounter, recordRequestMetric } from "../lib/monitoring.server";
import { logError, logWarn } from "../lib/observability.server";
import { checkRateLimit } from "../lib/rate-limit.server";

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
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session) {
      const res = json(
        {
          ok: false,
          error: "Sessão do app indisponível. Abra o app VCOM Reviews no admin da loja.",
        },
        { status: 503 },
      );
      finish(503);
      return res;
    }
    const requestIp = (
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "unknown"
    ).trim();
    const rateLimitKey = `submit:${session.shop}:${requestIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      limit: 12,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      incrementCounter("proxy_submit_rate_limited");
      const res = json(
        {
          ok: false,
          error: "Muitas tentativas em pouco tempo. Tente novamente em instantes.",
        },
        {
          status: 429,
          headers: {
            "retry-after": String(rateLimit.retryAfterSeconds),
          },
        },
      );
      finish(429);
      return res;
    }
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
      time: "",
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
    const correlationId = crypto.randomUUID();
    logError("app_proxy submit error", e, { correlationId });
    if (e instanceof Error) {
      logWarn("app_proxy submit client-safe error", {
        correlationId,
        message: e.message,
      });
    }
    const res = json(
      {
        ok: false,
        error: `Não foi possível enviar a avaliação. Código: ${correlationId}`,
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
