import {
  useFetcher,
  useLocation,
  useSubmit,
  type SubmitOptions,
} from "@remix-run/react";
import { useCallback } from "react";
import { withEmbeddedSearch } from "../lib/embedded-app-path";

function useEmbedAction() {
  const { pathname, search } = useLocation();

  return useCallback(
    (explicitAction?: string) =>
      withEmbeddedSearch(explicitAction ?? pathname, search),
    [pathname, search],
  );
}

/** POST/fetcher com shop, host e id_token na URL (obrigatório no app incorporado). */
export function useEmbeddedSubmit() {
  const submit = useSubmit();
  const embedAction = useEmbedAction();

  return useCallback(
    (target: Parameters<typeof submit>[0], options?: SubmitOptions) => {
      submit(target, {
        ...options,
        action: embedAction(options?.action),
      });
    },
    [submit, embedAction],
  );
}

export function useEmbeddedFetcher<T = unknown>(key?: string) {
  const fetcher = useFetcher<T>(key ? { key } : undefined);
  const embedAction = useEmbedAction();

  const submit = useCallback(
    (
      target: Parameters<typeof fetcher.submit>[0],
      options?: Parameters<typeof fetcher.submit>[1],
    ) => {
      return fetcher.submit(target, {
        ...options,
        action: embedAction(options?.action),
      });
    },
    [fetcher.submit, embedAction],
  );

  const load = useCallback(
    (href: string) => {
      return fetcher.load(embedAction(href));
    },
    [fetcher.load, embedAction],
  );

  return { ...fetcher, submit, load };
}

/** Mantém parâmetros de sessão do Shopify Admin em links internos. */
export function useEmbeddedAppPath() {
  const { search } = useLocation();

  return useCallback(
    (path: string) => withEmbeddedSearch(path, search),
    [search],
  );
}

export function useAppPaths() {
  const embedPath = useEmbeddedAppPath();

  return {
    app: embedPath("/app"),
    appearance: embedPath("/app/appearance"),
    setup: embedPath("/app/setup"),
    reviews: embedPath("/app/reviews"),
    reviewsNew: embedPath("/app/reviews/new"),
    reviewsGenerate: embedPath("/app/reviews/generate"),
    reviewsPending: embedPath("/app/reviews/pending"),
    reviewEdit: (id: string) =>
      embedPath(`/app/reviews/${encodeURIComponent(id)}`),
  };
}
