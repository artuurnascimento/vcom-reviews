// Provisionamento de credenciais pelo Vertix: quando um cliente novo é
// onboardado, o Vertix cria o custom app no Partner Dashboard e registra o
// par client_id/secret da loja aqui. Rota resource (só action), protegida por
// token de serviço compartilhado (env VERTIX_SERVICE_TOKEN).
//
//   POST /api/vertix/provision
//   Authorization: Bearer <VERTIX_SERVICE_TOKEN>
//   { "shopDomain": "cliente.myshopify.com", "clientId": "...", "clientSecret": "..." }

import crypto from "node:crypto";
import type { ActionFunctionArgs } from "@remix-run/node";
import { upsertCredential } from "../lib/app-credentials.server";
import { hasMasterKey } from "../lib/crypto.server";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante (não vaza o tamanho do prefixo que bateu). */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Domínio de loja: cliente.myshopify.com ou domínio custom válido.
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/;

function validationError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return "body deve ser um objeto JSON {shopDomain, clientId, clientSecret}";
  }
  const { shopDomain, clientId, clientSecret } = body as Record<
    string,
    unknown
  >;

  if (typeof shopDomain !== "string" || !shopDomain.trim()) {
    return "shopDomain obrigatório";
  }
  const domain = shopDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "");
  if (!DOMAIN_RE.test(domain)) {
    return "shopDomain inválido (esperado ex.: cliente.myshopify.com)";
  }

  if (typeof clientId !== "string" || !clientId.trim()) {
    return "clientId obrigatório";
  }
  if (/\s/.test(clientId.trim()) || clientId.trim().length < 10) {
    return "clientId inválido";
  }

  if (typeof clientSecret !== "string" || !clientSecret.trim()) {
    return "clientSecret obrigatório";
  }
  if (/\s/.test(clientSecret.trim()) || clientSecret.trim().length < 10) {
    return "clientSecret inválido";
  }

  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "método não permitido (use POST)" });
  }

  const serviceToken = process.env.VERTIX_SERVICE_TOKEN;
  if (!serviceToken) {
    return json(503, {
      ok: false,
      error: "VERTIX_SERVICE_TOKEN não configurado no servidor",
    });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";
  if (!bearer || !safeEquals(bearer, serviceToken)) {
    return json(401, { ok: false, error: "token de serviço inválido" });
  }

  if (!hasMasterKey()) {
    return json(503, {
      ok: false,
      error:
        "CREDENTIALS_MASTER_KEY ausente — o servidor não consegue criptografar o clientSecret (gere com: openssl rand -base64 32)",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON inválido no body" });
  }

  const error = validationError(body);
  if (error) {
    return json(400, { ok: false, error });
  }

  const { shopDomain, clientId, clientSecret } = body as {
    shopDomain: string;
    clientId: string;
    clientSecret: string;
  };

  const saved = await upsertCredential({ shopDomain, clientId, clientSecret });
  return json(201, { ok: true, shopDomain: saved.shopDomain });
};
