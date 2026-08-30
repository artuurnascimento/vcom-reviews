// Autenticação das rotas de serviço /api/vertix/* consumidas pelo console
// externo (Vertix Admin). Token único de serviço em env, comparado em tempo
// constante — nunca logar nem devolver o token em mensagens de erro.

import crypto from "node:crypto";
import { json } from "@remix-run/node";

const TOKEN_ENV = "VERTIX_SERVICE_TOKEN";

/**
 * Exige `Authorization: Bearer <VERTIX_SERVICE_TOKEN>` na requisição.
 * - env ausente → 503 (serviço não configurado; evita 401 enganoso)
 * - header ausente ou token errado → 401
 * Aborta com `throw json(...)` — o Remix devolve a Response direto.
 */
export function requireVertixToken(request: Request): void {
  const expected = process.env[TOKEN_ENV];
  if (!expected) {
    throw json(
      { ok: false, error: `${TOKEN_ENV} não configurado no servidor` },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim() ?? "";

  // Hash dos dois lados antes do timingSafeEqual: buffers sempre do mesmo
  // tamanho, então tokens de comprimento diferente não vazam timing nem lançam.
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();

  if (!provided || !crypto.timingSafeEqual(providedHash, expectedHash)) {
    throw json({ ok: false, error: "não autorizado" }, { status: 401 });
  }
}
