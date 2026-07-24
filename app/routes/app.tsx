import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { runAutomaticInfrastructureSetup } from "../lib/metaobject-setup.server";
import { ensureDefaultStorefrontSettings } from "../lib/storefront-settings.server";
import { EmbeddedAppProvider } from "../components/EmbeddedAppProvider";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let setup = {
    ok: true,
    errors: [] as string[],
    themeErrors: [] as string[],
    themeOk: true,
    theme: { accessDenied: false },
  };

  try {
    setup = await runAutomaticInfrastructureSetup(admin, session.shop);
  } catch (error) {
    console.error("[vcom-reviews] app loader setup", error);
    setup = {
      ok: false,
      errors: [
        error instanceof Error
          ? error.message
          : "Falha temporária ao validar a configuração automática.",
      ],
      themeErrors: [],
      themeOk: false,
      theme: { accessDenied: false },
    };
  }

  try {
    await ensureDefaultStorefrontSettings(admin);
  } catch (error) {
    console.error("[vcom-reviews] app loader storefront settings", error);
  }

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    setupOk: setup.ok,
    setupErrors: setup.errors,
    themeWarning:
      !setup.themeOk && setup.themeErrors.length
        ? setup.themeErrors.join(" · ")
        : null,
    themeAccessDenied: setup.theme.accessDenied,
  };
};

function AppNav() {
  const paths = useAppPaths();
  return (
    <NavMenu>
      <Link to={paths.app} rel="home">
        Painel
      </Link>
      <Link to={paths.reviews}>Avaliações</Link>
      <Link to={paths.reviewsGenerate}>Gerar com IA</Link>
      <Link to={paths.reviewsPending}>Pendentes</Link>
      <Link to={paths.import}>Importar</Link>
      <Link to={paths.appearance}>Aparência</Link>
      <Link to={paths.highlights}>Destaques</Link>
      <Link to={paths.setup}>Configuração</Link>
    </NavMenu>
  );
}

export default function AppLayout() {
  const { apiKey, setupOk, setupErrors, themeWarning, themeAccessDenied } =
    useLoaderData<typeof loader>();
  const paths = useAppPaths();
  return (
    <EmbeddedAppProvider apiKey={apiKey}>
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
            {setupErrors?.join(" · ") || "O metaobject de avaliações ainda não existe."}{" "}
            <a href={paths.setup}>Abrir configuração</a>
          </div>
        </div>
      ) : themeWarning ? (
        <div style={{ padding: "12px 16px" }}>
          <div
            style={{
              padding: "12px 16px",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            <strong>Homepage:</strong> {themeWarning}
            {themeAccessDenied ? " Reinstale o app para aceitar write_themes." : null}{" "}
            <a href={paths.setup}>Configuração</a>
          </div>
        </div>
      ) : null}
      <AppNav />
      <Outlet />
    </EmbeddedAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
