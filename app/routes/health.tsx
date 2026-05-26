import type { LoaderFunctionArgs } from "@remix-run/node";

/** Health check para Railway — sem auth Shopify. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return new Response("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
