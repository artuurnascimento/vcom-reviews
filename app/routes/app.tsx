import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { ensureReviewDefinitionReady } from "../lib/metaobject-setup.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const setup = await ensureReviewDefinitionReady(admin);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    setupOk: setup.ok,
    setupErrors: setup.errors,
  };
};

export default function AppLayout() {
  const { apiKey, setupOk, setupErrors } = useLoaderData<typeof loader>();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {!setupOk ? (
        <div style={{ padding: "12px 16px" }}>
          <div
            style={{
              padding: "12px 16px",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <strong>Configuração necessária:</strong>{" "}
            {setupErrors?.join(" · ") ||
              "O metaobject review ainda não existe."}{" "}
            <a href="/app/setup">Abrir configuração</a>
          </div>
        </div>
      ) : null}
      <NavMenu>
        <Link to="/app" rel="home">
          Painel
        </Link>
        <Link to="/app/reviews">Avaliações</Link>
        <Link to="/app/reviews/pending">Pendentes</Link>
        <Link to="/app/setup">Configuração</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
