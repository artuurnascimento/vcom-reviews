import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { captureSentryException, logWarn } from "../lib/observability.server";

function isEnabled() {
  const raw = process.env.ENABLE_SENTRY_TEST_ENDPOINT || "";
  return raw === "1" || raw.toLowerCase() === "true";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!isEnabled()) {
    return json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-sentry-test-token") || "";
  const expected = process.env.SENTRY_TEST_TOKEN?.trim() || "";
  if (!expected || token !== expected) {
    logWarn("sentry test endpoint unauthorized");
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const testError = new Error("SENTRY_TEST: controlled production smoke test");
  const eventId = captureSentryException(testError, {
    route: "/health/sentry-test",
    kind: "controlled-smoke-test",
  });

  return json({
    ok: true,
    sentry: { captured: Boolean(eventId), event_id: eventId || null },
    message: "Sentry test event emitted.",
  });
};

