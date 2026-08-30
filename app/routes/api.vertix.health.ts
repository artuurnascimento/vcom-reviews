// GET /api/vertix/health — liveness + contagem de lojas para o console Vertix.

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { listInstalledShops } from "../lib/service-db.server";
import { requireVertixToken } from "../lib/vertix-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  requireVertixToken(request);

  const shops = (await listInstalledShops()).length;

  return json({ ok: true, app: "vertix-reviews", shops });
};
