// GET /api/vertix/shops — lista das lojas instaladas para o console Vertix.
// Fonte: tabela de sessões do Shopify (lojas com sessão offline). Campos
// extras vêm do que a camada de dados oferece: os reviews vivem em
// metaobjects do Shopify (contagem via Admin API por loja) e o "desde"
// aproximado vem do primeiro usage_event registrado. NUNCA expor segredos.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { listInstalledShops } from "../lib/service-db.server";
import { requireVertixToken } from "../lib/vertix-auth.server";
import { hasCredentialForShop } from "../lib/app-credentials.server";
import { firstUsageEventAt } from "../lib/usage-events.server";
import { unauthenticated } from "../shopify.server";
import { listAllReviews } from "../lib/reviews.server";

async function reviewCountForShop(shop: string): Promise<number | null> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const reviews = await listAllReviews(admin);
    return reviews.length;
  } catch {
    // Sem sessão offline válida (ex.: token expirado) — devolve null em vez
    // de derrubar a listagem inteira.
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  requireVertixToken(request);

  const shopDomains = await listInstalledShops();

  const shops = await Promise.all(
    shopDomains.map(async (shop) => {
      const [reviewCount, firstEventAt, hasOwnCredential] = await Promise.all([
        reviewCountForShop(shop),
        firstUsageEventAt(shop),
        hasCredentialForShop(shop),
      ]);
      return {
        shop,
        // Aproximação: a tabela de sessões não guarda data de instalação;
        // usamos o primeiro evento de uso medido (null p/ lojas antigas).
        firstSeenAt: firstEventAt,
        reviewCount,
        // Flag derivada — indica se a loja usa custom app próprio, sem vazar o par.
        hasOwnCredential,
      };
    }),
  );

  return json({ ok: true, shops });
};
