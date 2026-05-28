import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getStorefrontSettings } from "../lib/storefront-settings.server";
import { logError } from "../lib/observability.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    if (!admin) return json({ ok: false, settings: null }, { status: 503 });
    const settings = await getStorefrontSettings(admin);
    return json({ ok: true, settings });
  } catch (e) {
    logError("app_proxy settings error", e);
    return json({ ok: false, settings: null }, { status: 500 });
  }
};
