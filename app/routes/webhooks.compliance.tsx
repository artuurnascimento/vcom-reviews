import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleComplianceWebhook } from "../lib/compliance-webhooks.server";

/**
 * Mandatory GDPR webhooks — HMAC verified via authenticate.webhook().
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      await handleComplianceWebhook("CUSTOMERS_DATA_REQUEST", shop, payload);
      break;
    case "CUSTOMERS_REDACT":
      await handleComplianceWebhook("CUSTOMERS_REDACT", shop, payload);
      break;
    case "SHOP_REDACT":
      await handleComplianceWebhook("SHOP_REDACT", shop, payload);
      break;
    default:
      return new Response("Unhandled compliance webhook topic", { status: 404 });
  }

  return new Response();
};
