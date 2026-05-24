import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Bounce page do App Bridge (token exchange).
 * authenticate.admin responde com HTML que recarrega a rota original com id_token.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AuthSessionToken() {
  return null;
}
