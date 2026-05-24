/** Preserva shop, host, embedded e id_token na navegação do app incorporado. */
const PRESERVED_PARAMS = ["shop", "host", "embedded", "locale", "id_token", "session"];

export function withEmbeddedSearch(path: string, currentSearch: string): string {
  if (!currentSearch) return path;

  const incoming = new URLSearchParams(currentSearch);
  if ([...incoming.keys()].length === 0) return path;

  const [pathname, existingQuery = ""] = path.split("?");
  const merged = new URLSearchParams(existingQuery);

  for (const key of PRESERVED_PARAMS) {
    const value = incoming.get(key);
    if (value != null && value !== "" && !merged.has(key)) {
      merged.set(key, value);
    }
  }

  const qs = merged.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
