import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { redirectWithEmbeddedSearch } from "../lib/embedded-app-path.server";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
import { useCallback, useState } from "react";
import {
  MODERATION_BATCH_SIZE,
  parseIdsJson,
  postModerationBatch,
} from "../lib/moderation-batch.shared";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  TextField,
  Badge,
  Button,
  EmptyState,
  BlockStack,
  InlineStack,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  approveReview,
  approveReviewsByIds,
  deleteReview,
  deleteReviewsByIds,
  listPendingReviews,
  rejectReview,
  rejectReviewsByIds,
} from "../lib/reviews.server";
import { ReviewStars } from "../components/ReviewStars";
import { ReviewModerationActions } from "../components/ReviewModerationActions";
import { useAppPaths, useEmbeddedAppPath } from "../hooks/useEmbeddedAppPath";

const PENDING_ROUTE_DATA_ID = "routes/app.reviews.pending";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const pending = await listPendingReviews(admin);
  return { pending };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");

  if (intent === "approveBatch" || intent === "rejectBatch" || intent === "deleteBatch") {
    const ids = parseIdsJson(String(form.get("ids") || "[]"));
    if (ids.length === 0) {
      return json({ ok: false, error: "Nenhuma avaliação no lote." });
    }
    const { processed, errors } =
      intent === "approveBatch"
        ? await approveReviewsByIds(admin, ids)
        : intent === "rejectBatch"
          ? await rejectReviewsByIds(admin, ids)
          : await deleteReviewsByIds(admin, ids);
    if (processed === 0) {
      return json({
        ok: false,
        error: errors[0] || "Não foi possível processar o lote.",
      });
    }
    return json({ ok: true, processed });
  }

  if (intent === "approveAll") {
    const pending = await listPendingReviews(admin);
    await approveReviewsByIds(
      admin,
      pending.map((r) => r.id),
    );
    return redirectWithEmbeddedSearch(request, "/app/reviews");
  }

  if (intent === "rejectAll") {
    const pending = await listPendingReviews(admin);
    await rejectReviewsByIds(
      admin,
      pending.map((r) => r.id),
    );
    return redirectWithEmbeddedSearch(request, "/app/reviews");
  }

  if (!id) return redirectWithEmbeddedSearch(request, "/app/reviews/pending");

  if (intent === "approve") {
    await approveReview(admin, id);
  } else if (intent === "reject") {
    await rejectReview(admin, id);
  } else if (intent === "delete") {
    await deleteReview(admin, id);
  }

  return redirectWithEmbeddedSearch(request, "/app/reviews/pending");
};

function truncate(text: string, max: number) {
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function PendingReviewsPage() {
  const paths = useAppPaths();
  const embedPath = useEmbeddedAppPath();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { pending } = useLoaderData<typeof loader>();
  const submit = useEmbeddedSubmit();
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<"approve" | "reject" | "delete" | null>(
    null,
  );

  const isBatchRunning = batchProgress !== null;
  const pendingIds = pending.map((r) => r.id);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPending =
    normalizedSearch.length === 0
      ? pending
      : pending.filter((review) => {
          const haystack = [
            review.author,
            review.title,
            review.body,
            review.time,
            review.status,
            review.placement,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        });

  const post = useCallback(
    (data: Record<string, string>) => {
      submit(data, { method: "post" });
    },
    [submit],
  );

  const runBulkModeration = useCallback(
    async (mode: "approve" | "reject" | "delete", ids: string[]) => {
      if (ids.length === 0) return;

      setBatchError(null);
      setBatchAction(mode);
      setBatchProgress({ done: 0, total: ids.length });

      const intent =
        mode === "approve"
          ? "approveBatch"
          : mode === "reject"
            ? "rejectBatch"
            : "deleteBatch";
      let done = 0;

      try {
        for (let offset = 0; offset < ids.length; offset += MODERATION_BATCH_SIZE) {
          const chunk = ids.slice(offset, offset + MODERATION_BATCH_SIZE);
          const fd = new FormData();
          fd.set("intent", intent);
          fd.set("ids", JSON.stringify(chunk));

          const result = await postModerationBatch(
            paths.reviewsPending,
            PENDING_ROUTE_DATA_ID,
            fd,
          );

          if (!result.ok) {
            const partial =
              done > 0
                ? ` (${done} de ${ids.length} já processadas — atualize a página.)`
                : "";
            throw new Error(`${result.error}${partial}`);
          }

          done += result.processed;
          setBatchProgress({ done, total: ids.length });
        }

        if (mode === "approve") {
          navigate(embedPath("/app/reviews"));
        } else {
          revalidator.revalidate();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao processar lote.";
        setBatchError(msg);
        revalidator.revalidate();
      } finally {
        setBatchProgress(null);
        setBatchAction(null);
      }
    },
    [paths.reviewsPending, embedPath, navigate, revalidator],
  );

  const handleApproveAll = useCallback(() => {
    if (
      !window.confirm(
        `Aprovar todas as ${pending.length} avaliações? Elas passarão a aparecer na vitrine.`,
      )
    ) {
      return;
    }
    void runBulkModeration("approve", pendingIds);
  }, [pending.length, pendingIds, runBulkModeration]);

  const handleRejectAll = useCallback(() => {
    if (
      !window.confirm(
        `Rejeitar todas as ${pending.length} avaliações? Não serão exibidas na loja.`,
      )
    ) {
      return;
    }
    void runBulkModeration("reject", pendingIds);
  }, [pending.length, pendingIds, runBulkModeration]);

  const handleDeleteAll = useCallback(() => {
    if (
      !window.confirm(
        `Excluir permanentemente todas as ${pending.length} avaliações pendentes? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    void runBulkModeration("delete", pendingIds);
  }, [pending.length, pendingIds, runBulkModeration]);

  return (
    <Page
      title="Aprovação pendente"
      subtitle={`${pending.length} aguardando moderação`}
      backAction={{ url: paths.reviews }}
      primaryAction={
        pending.length > 0
          ? {
              content: isBatchRunning && batchAction === "approve" && batchProgress
                ? `Aprovando ${batchProgress.done}/${batchProgress.total}…`
                : `Aprovar todas (${pending.length})`,
              onAction: handleApproveAll,
              disabled: isBatchRunning,
              loading: isBatchRunning && batchAction === "approve",
            }
          : undefined
      }
      secondaryActions={
        pending.length > 0
          ? [
              {
                content: isBatchRunning && batchAction === "reject" && batchProgress
                  ? `Rejeitando ${batchProgress.done}/${batchProgress.total}…`
                  : `Rejeitar todas (${pending.length})`,
                onAction: handleRejectAll,
                disabled: isBatchRunning,
              },
              {
                content: isBatchRunning && batchAction === "delete" && batchProgress
                  ? `Excluindo ${batchProgress.done}/${batchProgress.total}…`
                  : `Excluir todas (${pending.length})`,
                onAction: handleDeleteAll,
                disabled: isBatchRunning,
              },
              { content: "Ver todas", url: paths.reviews },
            ]
          : [{ content: "Ver todas", url: paths.reviews }]
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Avaliações geradas por IA ou enviadas pelo cliente só aparecem na vitrine
              depois de <strong>Aprovar</strong>.
            </Banner>

            {batchError ? (
              <Banner tone="critical" title="Erro na moderação em lote">
                <p>{batchError}</p>
              </Banner>
            ) : null}

            {isBatchRunning && batchProgress ? (
              <Banner tone="info" title="Processando em lotes">
                <p>
                  {batchAction === "approve" ? "Aprovando" : "Rejeitando"}{" "}
                  {batchProgress.done} de {batchProgress.total}… Não feche esta aba (
                  {MODERATION_BATCH_SIZE} por vez, evita timeout).
                </p>
              </Banner>
            ) : null}

            <TextField
              label="Pesquisar pendentes"
              value={searchQuery}
              onChange={setSearchQuery}
              autoComplete="off"
              placeholder="Ex.: entrega, nome do cliente, frase do comentário..."
              clearButton
              onClearButtonClick={() => setSearchQuery("")}
            />

            {searchQuery.trim() ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {filteredPending.length} resultado(s) para "{searchQuery.trim()}".
              </Text>
            ) : null}

            {pending.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação pendente"
                action={{ content: "Ver todas", url: paths.reviews }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Quando houver avaliações aguardando, elas aparecerão aqui.</p>
              </EmptyState>
            ) : filteredPending.length === 0 ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Nenhum resultado encontrado
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Tente outro termo, como parte do autor, título ou frase da avaliação.
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <Box overflowX="scroll">
                <Card padding="0">
                  <IndexTable
                    itemCount={filteredPending.length}
                    headings={[
                      { title: "Cliente / nota" },
                      { title: "Avaliação" },
                      { title: "Destino" },
                      { title: "Ações", alignment: "end" },
                    ]}
                    selectable={false}
                  >
                    {filteredPending.map((r, i) => (
                      <IndexTable.Row id={r.id} key={r.id} position={i}>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {r.author}
                            </Text>
                            <InlineStack gap="150" blockAlign="center">
                              <ReviewStars rating={r.rating} size={14} />
                              <Text as="span" variant="bodySm">
                                {r.rating}
                              </Text>
                            </InlineStack>
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            {r.title ? (
                              <Text as="span" variant="bodyMd" fontWeight="medium">
                                {truncate(r.title, 50)}
                              </Text>
                            ) : null}
                            <Text as="span" variant="bodySm" tone="subdued">
                              {truncate(r.body, 120)}
                            </Text>
                            {r.images.length > 0 ? (
                              <Badge tone="info">{`${r.images.length} foto(s)`}</Badge>
                            ) : null}
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone="attention">
                            {r.placement === "product" ? "Produto" : "Homepage"}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <ReviewModerationActions
                            reviewId={r.id}
                            status={r.status}
                            editUrl={paths.reviewEdit(r.id)}
                            onSubmit={post}
                            compact
                          />
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </Card>
              </Box>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
