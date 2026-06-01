import { sessionStorage } from "../shopify.server";
import { logInfo } from "./observability.server";

type ComplianceTopic =
  | "CUSTOMERS_DATA_REQUEST"
  | "CUSTOMERS_REDACT"
  | "SHOP_REDACT";

export async function deleteAllSessionsForShop(shop: string): Promise<void> {
  const sessions = await sessionStorage.findSessionsByShop(shop);
  if (sessions.length === 0) return;
  await sessionStorage.deleteSessions(sessions.map((s) => s.id));
  logInfo("compliance: deleted app sessions for shop", {
    shop,
    count: sessions.length,
  });
}

export async function handleComplianceWebhook(
  topic: ComplianceTopic,
  shop: string,
  payload: unknown,
): Promise<void> {
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Review content lives in the merchant's Shopify metaobjects (author, body).
      // No separate customer profile store in this app database.
      logInfo("compliance: customers/data_request received", { shop, payload });
      break;
    }
    case "CUSTOMERS_REDACT": {
      logInfo("compliance: customers/redact received", { shop, payload });
      break;
    }
    case "SHOP_REDACT": {
      await deleteAllSessionsForShop(shop);
      logInfo("compliance: shop/redact completed", { shop });
      break;
    }
    default: {
      const _exhaustive: never = topic;
      return _exhaustive;
    }
  }
}
