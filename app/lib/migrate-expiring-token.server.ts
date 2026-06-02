import type { Session } from "@shopify/shopify-api";
import { logInfo, logWarn } from "./observability.server";

type MigrateAuthClient = {
  auth: {
    migrateToExpiringToken: (params: {
      shop: string;
      nonExpiringOfflineAccessToken: string;
    }) => Promise<{ session: Session }>;
  };
};

/**
 * Troca token offline legado (permanente) por token expirável + refresh.
 * Migração irreversível por loja — ver migrateToExpiringToken na API Shopify.
 */
type ShopifyServer = {
  api: MigrateAuthClient;
  sessionStorage: {
    findSessionsByShop: (shop: string) => Promise<Session[]>;
    storeSession: (session: Session) => Promise<boolean>;
  };
};

export async function migrateLegacyOfflineTokenForShop(shop: string): Promise<void> {
  const shopifyModule = await import("../shopify.server");
  const shopify = shopifyModule.default as unknown as ShopifyServer;
  const storage = shopifyModule.sessionStorage;
  const api = shopify.api;

  const sessions = await storage.findSessionsByShop(shop);
  const offline = sessions.find((s) => !s.isOnline && s.accessToken);
  if (!offline?.accessToken || offline.refreshToken) return;

  try {
    const { session: migrated } = await api.auth.migrateToExpiringToken({
      shop,
      nonExpiringOfflineAccessToken: offline.accessToken,
    });
    await storage.storeSession(migrated);
    logInfo("migrated shop to expiring offline access token", { shop });
  } catch (error) {
    logWarn("expiring offline token migration skipped or failed", {
      shop,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
