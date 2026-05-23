import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureReviewInfrastructure } from "../lib/metaobject-setup.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.webhook(request);
  await ensureReviewInfrastructure(admin);
  return new Response();
};
