// /api/vertix/shops/:shop/settings — leitura (GET) e ajuste (PATCH) das
// configurações de vitrine de uma loja pelo console Vertix.
//
// As configurações deste app são as StorefrontSettings (aparência/textos da
// seção de avaliações — cores, tamanhos, labels, layout). Não há segredo
// nenhum nelas; credenciais de app NUNCA passam por esta rota (só pelo
// /api/vertix/provision, criptografadas).

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireVertixToken } from "../lib/vertix-auth.server";
import { unauthenticated } from "../shopify.server";
import {
  coerceStorefrontSettings,
  DEFAULT_STOREFRONT_SETTINGS,
  getStorefrontSettings,
  saveStorefrontSettings,
  type StorefrontSettings,
} from "../lib/storefront-settings.server";

type AdminClient = Awaited<
  ReturnType<typeof unauthenticated.admin>
>["admin"];

async function adminForShopOr404(shop: string): Promise<AdminClient> {
  if (!shop) {
    throw json({ ok: false, error: "loja não informada" }, { status: 400 });
  }
  try {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
  } catch {
    throw json(
      { ok: false, error: "loja não encontrada ou sem sessão offline" },
      { status: 404 },
    );
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  requireVertixToken(request);
  const admin = await adminForShopOr404(params.shop ?? "");
  const settings = await getStorefrontSettings(admin);
  return json({ ok: true, shop: params.shop, settings });
};

// ————— PATCH —————

function invalid(message: string): Response {
  return json({ ok: false, error: message }, { status: 422 });
}

const KNOWN_KEYS = new Set(Object.keys(DEFAULT_STOREFRONT_SETTINGS));

/**
 * Aceita um subconjunto das chaves de StorefrontSettings; chaves desconhecidas
 * são rejeitadas (evita typo silencioso do console). A validação de valor fica
 * a cargo do coerceStorefrontSettings — o mesmo funil das telas do app.
 */
function validatePatch(body: Record<string, unknown>): Partial<StorefrontSettings> {
  const unknown = Object.keys(body).filter((key) => !KNOWN_KEYS.has(key));
  if (unknown.length) {
    throw invalid(`campos desconhecidos: ${unknown.join(", ")}`);
  }
  if (!Object.keys(body).length) {
    throw invalid("nenhum campo informado");
  }
  return body as Partial<StorefrontSettings>;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  requireVertixToken(request);

  if (request.method !== "PATCH") {
    throw json({ ok: false, error: "use PATCH" }, { status: 405 });
  }

  const shop = params.shop ?? "";
  const admin = await adminForShopOr404(shop);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalid("corpo deve ser JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalid("corpo deve ser um objeto JSON");
  }

  const patch = validatePatch(body as Record<string, unknown>);

  const current = await getStorefrontSettings(admin);
  const merged = coerceStorefrontSettings({ ...current, ...patch });

  const result = await saveStorefrontSettings(admin, merged, shop);
  if (!result.ok) {
    return json(
      { ok: false, errors: result.errors, settings: merged },
      { status: 502 },
    );
  }

  return json({ ok: true, shop, settings: merged, errors: result.errors });
};
