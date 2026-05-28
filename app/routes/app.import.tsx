import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { Banner, BlockStack, Box, Card, Page, Text, TextField } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";
import {
  isAllowedExtensionOrigin,
  parseAllowedExtensionOrigins,
  processExtensionImportBatch,
  validateExtensionMessage,
  type ExtensionImportResult,
} from "../lib/import-extension.server";

type LoaderData = {
  extensionChannel: string;
  allowedOrigins: string[];
};

type ActionData =
  | ExtensionImportResult
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({
    extensionChannel: process.env.IMPORT_EXTENSION_CHANNEL?.trim() || "vcom.import",
    allowedOrigins: parseAllowedExtensionOrigins(),
  } satisfies LoaderData);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent !== "importExtension") {
    return json({ ok: false, error: "Intent inválido." } satisfies ActionData, { status: 400 });
  }

  const sourceOrigin = String(form.get("sourceOrigin") || "");
  if (!isAllowedExtensionOrigin(sourceOrigin)) {
    return json(
      { ok: false, error: "Origem da extensão não permitida." } satisfies ActionData,
      { status: 403 },
    );
  }

  const payloadRaw = String(form.get("payload") || "");
  let payloadUnknown: unknown;
  try {
    payloadUnknown = JSON.parse(payloadRaw);
  } catch {
    return json({ ok: false, error: "Payload inválido." } satisfies ActionData, { status: 400 });
  }

  const parsed = validateExtensionMessage(payloadUnknown);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error } satisfies ActionData, { status: 400 });
  }

  const result = await processExtensionImportBatch({
    admin,
    shop: session.shop,
    message: parsed.message,
  });
  return json(result satisfies ActionData, { status: result.ok ? 200 : 207 });
};

export default function ImportReviewsPage() {
  const paths = useAppPaths();
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const [lastOrigin, setLastOrigin] = useState("");
  const [lastBatch, setLastBatch] = useState("");

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event?.data || typeof event.data !== "object") return;
      const data = event.data as Record<string, unknown>;
      if (String(data.type || "") !== "vcom.import.reviews") return;
      if (String(data.channel || "") !== loaderData.extensionChannel) return;
      if (!loaderData.allowedOrigins.includes(event.origin)) return;

      setLastOrigin(event.origin);
      setLastBatch(String(data.batchId || ""));
      const form = new FormData();
      form.set("intent", "importExtension");
      form.set("sourceOrigin", event.origin);
      form.set("payload", JSON.stringify(data));
      fetcher.submit(form, { method: "post" });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetcher, loaderData.allowedOrigins, loaderData.extensionChannel]);

  const result = fetcher.data;
  const summary = useMemo(() => {
    if (!result || !("batchId" in result)) return null;
    return `${result.imported} importadas · ${result.duplicates} duplicadas · ${result.invalid} inválidas · ${result.failed} falhas`;
  }, [result]);

  return (
    <Page
      title="Importar avaliações"
      subtitle="Bridge direta com extensão AliExpress (postMessage)"
      backAction={{ url: paths.app }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Escuta automática ativa
            </Text>
            <Text as="p" tone="subdued">
              Esta página está aguardando mensagens da extensão no canal{" "}
              <code>{loaderData.extensionChannel}</code>.
            </Text>
            <Text as="p" tone="subdued">
              Origens permitidas:{" "}
              {loaderData.allowedOrigins.length > 0
                ? loaderData.allowedOrigins.join(", ")
                : "nenhuma configurada (defina IMPORT_EXTENSION_ALLOWED_ORIGINS)"}
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Última mensagem recebida
            </Text>
            <TextField label="Origin" value={lastOrigin} onChange={() => undefined} autoComplete="off" />
            <TextField label="Batch ID" value={lastBatch} onChange={() => undefined} autoComplete="off" />
            {fetcher.state !== "idle" ? (
              <Banner tone="info" title="Importando lote">
                Processando avaliações recebidas da extensão...
              </Banner>
            ) : null}
            {result && "ok" in result && !("batchId" in result) ? (
              <Banner tone="critical" title="Falha na importação">
                {result.error}
              </Banner>
            ) : null}
            {result && "batchId" in result ? (
              <Banner tone={result.ok ? "success" : "warning"} title={`Lote ${result.batchId}`}>
                {summary}
                {result.errors.length > 0 ? (
                  <Box paddingBlockStart="200">
                    <Text as="p" tone="subdued">
                      {result.errors.slice(0, 5).join(" · ")}
                    </Text>
                  </Box>
                ) : null}
              </Banner>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
