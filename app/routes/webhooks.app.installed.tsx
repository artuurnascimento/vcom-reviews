import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { runAutomaticInfrastructureSetup } from "../lib/metaobject-setup.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.webhook(request);
  if (!admin || !session?.shop) return new Response();
  await runAutomaticInfrastructureSetup(admin, session.shop);
  return new Response();
};
