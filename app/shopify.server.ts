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

initObservability();

const configuredSessionStorage = process.env.DATABASE_URL
  ? new PostgreSQLSessionStorage(process.env.DATABASE_URL)
  : new SQLiteSessionStorage("./database.sqlite");

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (process.env.SCOPES || "").split(",").filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: configuredSessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      try {
        const result = await runAutomaticInfrastructureSetup(admin, session.shop);
        if (!result.ok) {
          logWarn("afterAuth setup failed", { shop: session.shop, errors: result.errors });
        } else {
          await ensureDefaultStorefrontSettings(admin);
          const settings = await getStorefrontSettings(admin);
          if (settings.footer_trustpilot_show) {
            const footerSync = await ensureFooterTrustpilotPublished(
              admin,
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
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
