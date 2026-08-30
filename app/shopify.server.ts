// Registry multi-credencial do Shopify. O app é distribuído como "custom app
// por loja": cada cliente tem um app próprio no Partner Dashboard, com
// client_id/secret próprios, todos apontando para este backend. Aqui mantemos
// uma instância de shopifyApp() por par de credenciais e escolhemos a certa a
// partir da loja de cada request — a superfície exportada continua idêntica à
// anterior (authenticate, unauthenticated, login, ...), então nenhuma rota
// precisa saber que existe mais de uma instância.

import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { initObservability, logError, logWarn } from "./lib/observability.server";
import { runAutomaticInfrastructureSetup } from "./lib/metaobject-setup.server";
import {
  ensureDefaultStorefrontSettings,
  getStorefrontSettings,
} from "./lib/storefront-settings.server";
import { ensureFooterTrustpilotPublished } from "./lib/theme-footer-sync.server";
import { migrateLegacyOfflineTokenForShop } from "./lib/migrate-expiring-token.server";
import {
  getCredentialForShop,
  peekCredentialForShop,
  type ShopCredential,
} from "./lib/app-credentials.server";

initObservability();

function resolveSessionStorage() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return new SQLiteSessionStorage("./database.sqlite");
  }

  try {
    // Valida formato para evitar crash de bootstrap em produção.
    const parsed = new URL(databaseUrl);
    const isPg =
      parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
    if (!isPg) {
      logWarn("invalid DATABASE_URL protocol for postgres session storage", {
        protocol: parsed.protocol,
      });
      return new SQLiteSessionStorage("./database.sqlite");
    }
    return new PostgreSQLSessionStorage(databaseUrl);
  } catch (error) {
    logError("invalid DATABASE_URL, falling back to sqlite session storage", error);
    return new SQLiteSessionStorage("./database.sqlite");
  }
}

// Storage único compartilhado por todas as instâncias — as sessões vivem na
// mesma tabela; o que muda por cliente é só o par apiKey/apiSecret.
const configuredSessionStorage = resolveSessionStorage();

async function runAfterAuth({
  admin,
  session,
}: {
  admin: Parameters<typeof runAutomaticInfrastructureSetup>[0];
  session: { shop: string };
}) {
  try {
    const result = await runAutomaticInfrastructureSetup(admin, session.shop);
    if (!result.ok) {
      logWarn("afterAuth setup failed", { shop: session.shop, errors: result.errors });
    } else {
      await ensureDefaultStorefrontSettings(admin);
      const settings = await getStorefrontSettings(admin);
      if (settings.footer_trustpilot_show) {
        const footerSync = await ensureFooterTrustpilotPublished(
          admin as never,
          session.shop,
          true,
        );
        if (!footerSync.ok) {
          logWarn("afterAuth footer publish", {
            shop: session.shop,
            errors: footerSync.errors,
          });
        }
      }
    }
  } catch (error) {
    logError("afterAuth setup error", error, { shop: session.shop });
  }
}

/** Cria uma instância shopifyApp com as opções padrão do app, trocando só o
 * par de credenciais. */
function buildInstance(apiKey: string, apiSecretKey: string) {
  return shopifyApp({
    apiKey,
    apiSecretKey,
    apiVersion: ApiVersion.January25,
    scopes: (process.env.SCOPES || "").split(",").filter(Boolean),
    appUrl: process.env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: configuredSessionStorage,
    distribution: AppDistribution.AppStore,
    future: {
      unstable_newEmbeddedAuthStrategy: true,
      expiringOfflineAccessTokens: true,
    },
    hooks: {
      afterAuth: async ({ admin, session }) => {
        await migrateLegacyOfflineTokenForShop(session.shop);
        await runAfterAuth({ admin, session });
      },
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
}

type ShopifyInstance = ReturnType<typeof buildInstance>;

// Instância default (credenciais do env) — comportamento atual, atende as
// lojas já instaladas e qualquer loja sem app_credentials no banco.
const defaultInstance = buildInstance(
  process.env.SHOPIFY_API_KEY || "",
  process.env.SHOPIFY_API_SECRET || "",
);

// Cache de instâncias por clientId. Guardamos o secret junto para reconstruir
// a instância caso o secret seja rotacionado com o mesmo clientId.
const instanceCache = new Map<
  string,
  { secret: string; instance: ShopifyInstance }
>();

function instanceForCredential(cred: ShopCredential): ShopifyInstance {
  const cached = instanceCache.get(cred.clientId);
  if (cached && cached.secret === cred.clientSecret) return cached.instance;

  const instance = buildInstance(cred.clientId, cred.clientSecret);
  instanceCache.set(cred.clientId, {
    secret: cred.clientSecret,
    instance,
  });
  return instance;
}

/** Instância certa para uma loja: a do custom app dela, ou a default. */
async function instanceForShop(
  shopDomain: string | null | undefined,
): Promise<ShopifyInstance> {
  if (!shopDomain) return defaultInstance;
  const cred = await getCredentialForShop(shopDomain);
  return cred ? instanceForCredential(cred) : defaultInstance;
}

/**
 * Extrai a loja do claim `dest` de um session token (JWT), SEM verificar a
 * assinatura — aqui só decidimos QUAL instância usar; a verificação
 * criptográfica de verdade acontece dentro do authenticate da instância
 * escolhida (que conhece o secret certo).
 */
function shopFromSessionToken(token: string): string | null {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as { dest?: unknown };
    if (typeof payload.dest !== "string") return null;
    // dest vem como https://loja.myshopify.com
    const shop = payload.dest.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return shop || null;
  } catch {
    return null;
  }
}

/** Resolve a loja de um Request (query `shop`, header de webhook, session
 * token na query ou no Authorization). */
function shopFromRequest(request: Request): string | null {
  const url = new URL(request.url);

  // 1. Query param `shop` (OAuth, login, páginas do admin embutido, app proxy)
  const shopParam = url.searchParams.get("shop");
  if (shopParam) return shopParam;

  // 2. Header dos webhooks
  const headerShop = request.headers.get("x-shopify-shop-domain");
  if (headerShop) return headerShop;

  // 3. Session token na query (id_token do embedded auth / session)
  const queryToken =
    url.searchParams.get("id_token") ?? url.searchParams.get("session");
  if (queryToken) {
    const shop = shopFromSessionToken(queryToken);
    if (shop) return shop;
  }

  // 4. Session token no Authorization (fetches do app embutido via App Bridge)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const shop = shopFromSessionToken(authHeader.slice("bearer ".length));
    if (shop) return shop;
  }

  return null;
}

/** Instância certa para um Request. */
async function instanceForRequest(request: Request): Promise<ShopifyInstance> {
  return instanceForShop(shopFromRequest(request));
}

// ---------------------------------------------------------------------------
// Exports — mesma superfície de antes (wrappers que delegam à instância
// certa). Os métodos já eram async por natureza, então o "await interno"
// extra é invisível para as rotas.
// ---------------------------------------------------------------------------

export const apiVersion = ApiVersion.January25;

export const authenticate = {
  admin: async (request: Request) =>
    (await instanceForRequest(request)).authenticate.admin(request),
  flow: async (request: Request) =>
    (await instanceForRequest(request)).authenticate.flow(request),
  fulfillmentService: async (request: Request) =>
    (await instanceForRequest(request)).authenticate.fulfillmentService(
      request,
    ),
  webhook: async (request: Request) =>
    (await instanceForRequest(request)).authenticate.webhook(request),
  public: {
    checkout: async (
      ...args: Parameters<ShopifyInstance["authenticate"]["public"]["checkout"]>
    ) =>
      (await instanceForRequest(args[0])).authenticate.public.checkout(...args),
    appProxy: async (request: Request) =>
      (await instanceForRequest(request)).authenticate.public.appProxy(request),
    customerAccount: async (
      ...args: Parameters<
        ShopifyInstance["authenticate"]["public"]["customerAccount"]
      >
    ) =>
      (await instanceForRequest(args[0])).authenticate.public.customerAccount(
        ...args,
      ),
  },
};

export const unauthenticated = {
  admin: async (shop: string) =>
    (await instanceForShop(shop)).unauthenticated.admin(shop),
  storefront: async (shop: string) =>
    (await instanceForShop(shop)).unauthenticated.storefront(shop),
};

export const login = async (request: Request) =>
  (await instanceForRequest(request)).login(request);

export const registerWebhooks = async (
  options: Parameters<ShopifyInstance["registerWebhooks"]>[0],
) => (await instanceForShop(options.session.shop)).registerWebhooks(options);

/**
 * Precisa continuar SÍNCRONO: os headers vão para a Response logo em seguida.
 * Usamos a credencial já cacheada quando existe; senão a default (os headers
 * de documento — CSP frame-ancestors — dependem da loja/config, não do
 * apiKey, então o fallback é equivalente) e aquecemos o cache em background
 * para os próximos requests.
 */
export const addDocumentResponseHeaders = (
  request: Request,
  headers: Headers,
): void => {
  const shop = shopFromRequest(request);
  let instance = defaultInstance;
  if (shop) {
    const cred = peekCredentialForShop(shop);
    if (cred) {
      instance = instanceForCredential(cred);
    } else if (cred === undefined) {
      // Ainda não está no cache — aquece sem bloquear a resposta.
      void getCredentialForShop(shop).catch(() => {});
    }
  }
  instance.addDocumentResponseHeaders(request, headers);
};

// O storage é um só, compartilhado por todas as instâncias.
export const sessionStorage: ShopifyInstance["sessionStorage"] =
  defaultInstance.sessionStorage;

const shopify = {
  apiVersion,
  addDocumentResponseHeaders,
  authenticate,
  unauthenticated,
  login,
  registerWebhooks,
  sessionStorage,
};

export default shopify;
