// Medição de uso por loja (tabela usage_events no banco de serviço).
// Evento principal: "review_coletada" — registrado fire-and-forget no ponto
// único de criação de review (createMetaobject em reviews.server.ts), para o
// console Vertix medir volume por período sem depender do campo `time` dos
// metaobjects (que é texto livre e às vezes vazio).

import { serviceQuery } from "./service-db.server";
import { logWarn } from "./observability.server";

type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export const USAGE_EVENT_REVIEW_COLLECTED = "review_coletada";

/** Insere um evento de uso. Lança em erro de banco — use a variante
 * fire-and-forget nos caminhos quentes. */
export async function recordUsageEvent(input: {
  shop: string;
  type: string;
  quantity?: number;
  occurredAt?: Date;
}): Promise<void> {
  await serviceQuery(
    `INSERT INTO usage_events (shop, type, quantity, occurred_at)
     VALUES (?, ?, ?, ?)`,
    [
      input.shop,
      input.type,
      input.quantity ?? 1,
      (input.occurredAt ?? new Date()).toISOString(),
    ],
  );
}

/** Soma de quantity dos eventos de um tipo no período [from, to]. */
export async function sumUsageEvents(
  shop: string,
  type: string,
  from: Date,
  to: Date,
): Promise<number> {
  const rows = await serviceQuery(
    `SELECT COALESCE(SUM(quantity), 0) AS total
       FROM usage_events
      WHERE shop = ? AND type = ? AND occurred_at >= ? AND occurred_at <= ?`,
    [shop, type, from.toISOString(), to.toISOString()],
  );
  const total = rows[0]?.total;
  return typeof total === "number" ? total : Number(total ?? 0) || 0;
}

/** Primeiro evento registrado da loja (aproximação de "instalada desde"). */
export async function firstUsageEventAt(shop: string): Promise<string | null> {
  const rows = await serviceQuery(
    `SELECT MIN(occurred_at) AS first_at FROM usage_events WHERE shop = ?`,
    [shop],
  );
  const value = rows[0]?.first_at;
  return typeof value === "string" && value ? value : null;
}

// ---------------------------------------------------------------------------
// review_coletada fire-and-forget
// ---------------------------------------------------------------------------

// O createReview só recebe o client admin (sem shop). Resolvemos o domínio
// com uma query GraphQL e cacheamos por client (WeakMap) — importa em
// importações em lote, onde o mesmo admin cria dezenas de reviews.
const shopByAdmin = new WeakMap<AdminApi, Promise<string | null>>();

async function resolveShopDomain(admin: AdminApi): Promise<string | null> {
  const cached = shopByAdmin.get(admin);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const response = await admin.graphql(
        `#graphql
        query UsageEventShopDomain {
          shop { myshopifyDomain }
        }`,
      );
      const json = await response.json();
      const domain = json.data?.shop?.myshopifyDomain;
      return typeof domain === "string" && domain ? domain : null;
    } catch {
      return null;
    }
  })();
  shopByAdmin.set(admin, promise);
  return promise;
}

/**
 * Registra "review_coletada" sem bloquear nem quebrar o caminho de criação —
 * medição nunca pode derrubar a coleta de um review.
 */
export function recordReviewCollected(admin: AdminApi): void {
  void (async () => {
    const shop = await resolveShopDomain(admin);
    if (!shop) return;
    await recordUsageEvent({ shop, type: USAGE_EVENT_REVIEW_COLLECTED });
  })().catch((error) => {
    logWarn("usage-events: falha ao registrar review_coletada", {
      detail: error instanceof Error ? error.message : String(error),
    });
  });
}
