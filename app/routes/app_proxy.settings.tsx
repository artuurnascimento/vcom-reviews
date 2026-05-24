import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getStorefrontSettings } from "../lib/storefront-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.public.appProxy(request);
    const settings = await getStorefrontSettings(admin);
    return json({ ok: true, settings });
  } catch (e) {
    console.error("app_proxy settings error", e);
    return json({ ok: false, settings: null }, { status: 500 });
  }
};
