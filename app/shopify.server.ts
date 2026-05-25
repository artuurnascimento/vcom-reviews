import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { runAutomaticInfrastructureSetup } from "./lib/metaobject-setup.server";
import {
  ensureDefaultStorefrontSettings,
  getStorefrontSettings,
} from "./lib/storefront-settings.server";
import { ensureFooterTrustpilotThemeFiles } from "./lib/theme-footer.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: (process.env.SCOPES || "").split(",").filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new SQLiteSessionStorage("./database.sqlite"),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      try {
        const result = await runAutomaticInfrastructureSetup(admin, session.shop);
        if (!result.ok) {
          console.error(
            "[vcom-reviews] afterAuth setup failed",
            session.shop,
            result.errors,
          );
        } else {
          await ensureDefaultStorefrontSettings(admin);
          const settings = await getStorefrontSettings(admin);
          if (settings.footer_trustpilot_show) {
            const footerSync = await ensureFooterTrustpilotThemeFiles(admin, true);
            if (!footerSync.ok) {
              console.warn(
                "[vcom-reviews] afterAuth footer theme sync",
                session.shop,
                footerSync.errors,
              );
            }
          }
        }
      } catch (error) {
        console.error("[vcom-reviews] afterAuth setup error", session.shop, error);
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
