// Credenciais Shopify por loja — modelo "custom app por loja": cada cliente
// tem um app próprio no Partner Dashboard (client_id/secret próprios), todos
// apontando para este mesmo backend. A tabela app_credentials guarda o par de
// cada loja; lojas sem registro caem nas credenciais default do env (as lojas
// já instaladas hoje).
//
// O cache em memória (TTL ~60s) evita uma ida ao banco a cada request — o
// authenticate roda em todo loader/action do admin embutido.

import { serviceQuery } from "./service-db.server";
import { encryptSecret, tryDecryptSecret } from "./crypto.server";

const CACHE_TTL_MS = 60_000;

export interface ShopCredential {
  clientId: string;
  clientSecret: string;
}

interface CacheEntry {
  value: ShopCredential | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Normaliza um domínio de loja: lowercase, sem protocolo, sem path/barras. */
export function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\/+$/, "");
}

/**
 * Busca a credencial da loja (com cache). Devolve null quando a loja não tem
 * custom app próprio — o chamador usa as credenciais default do env.
 * Resultados negativos também são cacheados: as lojas default consultariam o
 * banco a cada request sem isso.
 */
export async function getCredentialForShop(
  shopDomain: string,
): Promise<ShopCredential | null> {
  const shop = normalizeShopDomain(shopDomain);
  if (!shop) return null;

  const now = Date.now();
  const hit = cache.get(shop);
  if (hit && hit.expiresAt > now) return hit.value;

  const rows = await serviceQuery(
    `SELECT client_id, client_secret_enc FROM app_credentials WHERE shop_domain = ?`,
    [shop],
  );
  const row = rows[0];

  let value: ShopCredential | null = null;
  if (row && typeof row.client_id === "string") {
    // tryDecryptSecret devolve null p/ campo corrompido ou chave-mestra
    // trocada — nesse caso tratamos como "sem credencial" (fallback default)
    // em vez de derrubar o request.
    const clientSecret = tryDecryptSecret(
      typeof row.client_secret_enc === "string" ? row.client_secret_enc : null,
    );
    if (clientSecret) {
      value = { clientId: row.client_id, clientSecret };
    }
  }

  cache.set(shop, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Versão síncrona: só olha o cache, sem ir ao banco. Existe para chamadores
 * que não podem ser async (ex.: addDocumentResponseHeaders no entry.server).
 * Devolve undefined quando a loja ainda não está no cache.
 */
export function peekCredentialForShop(
  shopDomain: string,
): ShopCredential | null | undefined {
  const shop = normalizeShopDomain(shopDomain);
  if (!shop) return null;
  const hit = cache.get(shop);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  return undefined;
}

/** A loja tem credencial própria registrada? (sem expor o secret) */
export async function hasCredentialForShop(shopDomain: string): Promise<boolean> {
  return (await getCredentialForShop(shopDomain)) !== null;
}

/**
 * Cria/atualiza a credencial de uma loja (chamado pelo provisionamento do
 * Vertix). Criptografa o secret em repouso e invalida o cache da loja.
 */
export async function upsertCredential(input: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ shopDomain: string; clientId: string }> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const clientId = input.clientId.trim();
  const clientSecretEnc = encryptSecret(input.clientSecret.trim());
  const now = new Date().toISOString();

  // ON CONFLICT DO UPDATE é suportado igual nos dois dialetos (pg e sqlite).
  await serviceQuery(
    `INSERT INTO app_credentials
       (shop_domain, client_id, client_secret_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (shop_domain) DO UPDATE SET
       client_id = excluded.client_id,
       client_secret_enc = excluded.client_secret_enc,
       updated_at = excluded.updated_at`,
    [shopDomain, clientId, clientSecretEnc, now, now],
  );

  // Invalida para o próximo request já enxergar a credencial nova.
  cache.delete(shopDomain);

  return { shopDomain, clientId };
}
