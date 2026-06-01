import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { deleteAllSessionsForShop } from "../lib/compliance-webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  if (shop) {
    await deleteAllSessionsForShop(shop);
  }
  return new Response();
};
