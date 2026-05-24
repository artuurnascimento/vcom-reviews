import { redirect } from "@remix-run/node";
import { withEmbeddedSearch } from "./embedded-app-path";

export function redirectWithEmbeddedSearch(request: Request, path: string) {
  const target = withEmbeddedSearch(path, new URL(request.url).search);
  return redirect(target);
}
