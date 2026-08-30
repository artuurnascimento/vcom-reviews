// GET /api/vertix/shops/:shop/stats?from=ISO&to=ISO — métricas de reviews de
// uma loja para o console Vertix. Sem período informado, usa os últimos 30
// dias.
//
// Os reviews vivem em metaobjects do Shopify e o campo `time` deles é texto
// livre (às vezes vazio), então os totais/média são do acervo inteiro e o
// recorte por período vem de duas fontes:
//   - collected: usage_events "review_coletada" (medição confiável daqui pra
//     frente, gravada na criação de cada review);
//   - reviewsInPeriod: melhor esforço parseando `time` dos reviews.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireVertixToken } from "../lib/vertix-auth.server";
import { unauthenticated } from "../shopify.server";
import { listAllReviews } from "../lib/reviews.server";
import {
  sumUsageEvents,
  USAGE_EVENT_REVIEW_COLLECTED,
} from "../lib/usage-events.server";
import type { ReviewRecord } from "../lib/constants";

const DEFAULT_PERIOD_DAYS = 30;

/** Converte ?from/?to em Date, rejeitando datas inválidas com 400. */
function parsePeriodParam(value: string | null, name: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw json(
      { ok: false, error: `parâmetro "${name}" inválido — use data ISO 8601` },
      { status: 400 },
    );
  }
  return parsed;
}

function countInPeriod(reviews: ReviewRecord[], from: Date, to: Date): number {
  let count = 0;
  for (const review of reviews) {
    if (!review.time) continue;
    const at = new Date(review.time);
    if (Number.isNaN(at.getTime())) continue;
    if (at >= from && at <= to) count += 1;
  }
  return count;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  requireVertixToken(request);

  const shop = params.shop ?? "";
  if (!shop) {
    throw json({ ok: false, error: "loja não informada" }, { status: 400 });
  }

  const url = new URL(request.url);
  const to = parsePeriodParam(url.searchParams.get("to"), "to") ?? new Date();
  const from =
    parsePeriodParam(url.searchParams.get("from"), "from") ??
    new Date(to.getTime() - DEFAULT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  let reviews: ReviewRecord[];
  try {
    const { admin } = await unauthenticated.admin(shop);
    reviews = await listAllReviews(admin);
  } catch {
    // unauthenticated.admin lança quando a loja não tem sessão offline —
    // para o console isso é "loja não encontrada/instalada".
    throw json(
      { ok: false, error: "loja não encontrada ou sem sessão offline" },
      { status: 404 },
    );
  }

  const approved = reviews.filter((r) => r.status === "approved");
  const pending = reviews.filter((r) => r.status === "pending");
  const rejected = reviews.filter((r) => r.status === "rejected");
  const ratingSum = approved.reduce((sum, r) => sum + r.rating, 0);

  const collected = await sumUsageEvents(
    shop,
    USAGE_EVENT_REVIEW_COLLECTED,
    from,
    to,
  );

  return json({
    ok: true,
    shop,
    period: { from: from.toISOString(), to: to.toISOString() },
    reviews: {
      total: reviews.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      averageRating: approved.length
        ? Number((ratingSum / approved.length).toFixed(2))
        : null,
    },
    collected,
    reviewsInPeriod: countInPeriod(reviews, from, to),
  });
};
