import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Client } from "pg";
import { evaluateMonitoringAlerts, getMonitoringSnapshot } from "../lib/monitoring.server";
import { redisPing } from "../lib/redis-cache.server";

/** Health check para Railway — sem auth Shopify. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const started = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {
    app: { ok: true },
  };

  if (process.env.DATABASE_URL) {
    let dbClient: Client | null = null;
    try {
      dbClient = new Client({ connectionString: process.env.DATABASE_URL });
      await dbClient.connect();
      await dbClient.query("select 1");
      checks.database = { ok: true };
    } catch (error) {
      checks.database = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await dbClient?.end().catch(() => undefined);
    }
  } else {
    checks.database = { ok: true, detail: "sqlite-fallback" };
  }

  if (process.env.REDIS_URL) {
    checks.redis = { ok: await redisPing() };
  } else {
    checks.redis = { ok: true, detail: "not-configured" };
  }

  const monitoring = getMonitoringSnapshot();
  const alerts = evaluateMonitoringAlerts(monitoring);
  const degraded = Object.values(checks).some((c) => !c.ok);
  const status = degraded ? 503 : 200;

  return json(
    {
      ok: !degraded,
      status: degraded ? "degraded" : "ok",
      checks,
      monitoring,
      alerts,
      uptime_s: Math.round(process.uptime()),
      now: new Date().toISOString(),
      duration_ms: Date.now() - started,
    },
    { status },
  );
};
