import { forwardRef, useMemo } from "react";
import { Link, useLocation, type LinkProps } from "@remix-run/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/pt-BR.json";
import { withEmbeddedSearch } from "../lib/embedded-app-path";

const APP_BRIDGE_URL = "https://cdn.shopify.com/shopifycloud/app-bridge.js";

type Props = {
  apiKey: string;
  children: React.ReactNode;
};

export function EmbeddedAppProvider({ apiKey, children }: Props) {
  const { search } = useLocation();

  const linkComponent = useMemo(() => {
    const EmbeddedLink = forwardRef<HTMLAnchorElement, LinkProps & { url?: string }>(
      function EmbeddedLink({ to, url, ...rest }, ref) {
        const target = url ?? to;
        const resolved =
          typeof target === "string" ? withEmbeddedSearch(target, search) : target;
        return <Link {...rest} to={resolved} ref={ref} />;
      },
    );
    EmbeddedLink.displayName = "EmbeddedLink";
    return EmbeddedLink;
  }, [search]);

  return (
    <>
      <script src={APP_BRIDGE_URL} data-api-key={apiKey} />
      <PolarisAppProvider i18n={polarisTranslations} linkComponent={linkComponent as never}>
        {children}
      </PolarisAppProvider>
    </>
  );
}
