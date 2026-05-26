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
  Badge,
  Button,
  EmptyState,
  InlineGrid,
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
  listPendingReviews,
  listRejectedReviews,
  listAllReviews,
  rejectReview,
  rejectReviewsByIds,
} from "../lib/reviews.server";
import { getDashboardStats } from "../lib/dashboard.server";
import { StatCard } from "../components/StatCard";
import { ReviewStars } from "../components/ReviewStars";
import { ReviewModerationActions } from "../components/ReviewModerationActions";
import { useAppPaths, useEmbeddedAppPath } from "../hooks/useEmbeddedAppPath";

const REVIEWS_INDEX_ROUTE_DATA_ID = "routes/app.reviews._index";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [stats, reviews, pending, rejected] = await Promise.all([
    getDashboardStats(admin),
    listAllReviews(admin),
    listPendingReviews(admin),
    listRejectedReviews(admin),
  ]);
  return {
    reviews,
    stats,
    pendingIds: pending.map((r) => r.id),
    rejectedIds: rejected.map((r) => r.id),
    rejectedCount: rejected.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");

  if (intent === "approveBatch" || intent === "rejectBatch") {
    const ids = parseIdsJson(String(form.get("ids") || "[]"));
    if (ids.length === 0) {
      return json({ ok: false, error: "Nenhuma avaliação no lote." });
    }
    const { processed, errors } =
      intent === "approveBatch"
        ? await approveReviewsByIds(admin, ids)
        : await rejectReviewsByIds(admin, ids);
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

  if (intent === "approveAllRejected") {
    const rejected = await listRejectedReviews(admin);
    await approveReviewsByIds(
      admin,
      rejected.map((r) => r.id),
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

  if (!id) return redirectWithEmbeddedSearch(request, "/app/reviews");

  if (intent === "approve") {
    await approveReview(admin, id);
  } else if (intent === "reject") {
    await rejectReview(admin, id);
  } else if (intent === "delete") {
    await deleteReview(admin, id);
  }

  return redirectWithEmbeddedSearch(request, "/app/reviews");
};

function truncate(text: string, max: number) {
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function ReviewsIndex() {
  const paths = useAppPaths();
  const embedPath = useEmbeddedAppPath();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { reviews, stats, pendingIds, rejectedIds, rejectedCount } =
    useLoaderData<typeof loader>();
  const submit = useEmbeddedSubmit();
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<"pending" | "rejected" | null>(null);
  const isBatchRunning = batchProgress !== null;

  const post = useCallback(
    (data: Record<string, string>) => {
      submit(data, { method: "post" });
    },
    [submit],
  );

  const runBulkModeration = useCallback(
    async (mode: "approve" | "reject", ids: string[], source: "pending" | "rejected") => {
      if (ids.length === 0) return;

      setBatchError(null);
      setBatchMode(source);
      setBatchProgress({ done: 0, total: ids.length });

      const intent = mode === "approve" ? "approveBatch" : "rejectBatch";
      let done = 0;

      try {
        for (let offset = 0; offset < ids.length; offset += MODERATION_BATCH_SIZE) {
          const chunk = ids.slice(offset, offset + MODERATION_BATCH_SIZE);
          const fd = new FormData();
          fd.set("intent", intent);
          fd.set("ids", JSON.stringify(chunk));

          const result = await postModerationBatch(
            paths.reviews,
            REVIEWS_INDEX_ROUTE_DATA_ID,
            fd,
          );

          if (!result.ok) {
            const partial = done > 0 ? ` (${done} de ${ids.length} já processadas.)` : "";
            throw new Error(`${result.error}${partial}`);
          }

          done += result.processed;
          setBatchProgress({ done, total: ids.length });
        }

        revalidator.revalidate();
        if (mode === "approve") {
          navigate(embedPath("/app/reviews"));
        }
      } catch (err) {
        setBatchError(err instanceof Error ? err.message : "Erro ao processar lote.");
        revalidator.revalidate();
      } finally {
        setBatchProgress(null);
        setBatchMode(null);
      }
    },
    [paths.reviews, embedPath, navigate, revalidator],
  );

  const handleApproveAll = useCallback(() => {
    if (
      !window.confirm(
        `Aprovar todas as ${stats.pendingCount} avaliações pendentes? Elas passarão a aparecer na vitrine.`,
      )
    ) {
      return;
    }
    void runBulkModeration("approve", pendingIds, "pending");
  }, [stats.pendingCount, pendingIds, runBulkModeration]);

  const handleApproveAllRejected = useCallback(() => {
    if (
      !window.confirm(
        `Aprovar todas as ${rejectedCount} avaliações rejeitadas? Elas passarão a aparecer na vitrine.`,
      )
    ) {
      return;
    }
    void runBulkModeration("approve", rejectedIds, "rejected");
  }, [rejectedCount, rejectedIds, runBulkModeration]);

  const handleRejectAll = useCallback(() => {
    if (
      !window.confirm(
        `Rejeitar todas as ${stats.pendingCount} avaliações pendentes? Esta ação não publica na loja.`,
      )
    ) {
      return;
    }
    void runBulkModeration("reject", pendingIds, "pending");
  }, [stats.pendingCount, pendingIds, runBulkModeration]);

  return (
    <Page
      title="Avaliações"
      subtitle={`${stats.totalReviews} publicadas · ${stats.pendingCount} pendentes · ${rejectedCount} rejeitadas · média ${stats.averageRating}`}
      backAction={{ url: paths.app }}
      primaryAction={{ content: "Nova avaliação", url: paths.reviewsNew }}
      secondaryActions={[
        { content: "Gerar com IA", url: paths.reviewsGenerate },
        {
          content: `Pendentes (${stats.pendingCount})`,
          url: paths.reviewsPending,
        },
      ]}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
          <StatCard label="Publicadas" value={stats.totalReviews} />
          <StatCard label="Pendentes" value={stats.pendingCount} />
          <StatCard label="Média" value={stats.averageRating} />
          <StatCard label="Homepage" value={stats.homepagePublished} />
        </InlineGrid>

        {batchError ? (
          <Banner tone="critical" title="Erro na moderação em lote">
            <p>{batchError}</p>
          </Banner>
        ) : null}

        {isBatchRunning && batchProgress ? (
          <Banner tone="info" title="Processando em lotes">
            <p>
              {batchMode === "rejected" ? "Aprovando rejeitadas" : "Processando"}:{" "}
              {batchProgress.done} de {batchProgress.total}… Não feche esta aba.
            </p>
          </Banner>
        ) : null}

        {rejectedCount > 0 ? (
          <Banner
            title={`${rejectedCount} avaliação(ões) rejeitada(s)`}
            tone="warning"
          >
            <BlockStack gap="300">
              <p>
                Estas avaliações não aparecem na loja. Use <strong>Aprovar</strong> em cada
                linha ou aprove todas de uma vez ({MODERATION_BATCH_SIZE} por lote).
              </p>
              <InlineStack gap="200" wrap>
                <Button
                  variant="primary"
                  onClick={handleApproveAllRejected}
                  loading={isBatchRunning && batchMode === "rejected"}
                  disabled={isBatchRunning}
                >
                  {isBatchRunning && batchProgress && batchMode === "rejected"
                    ? `Aprovando ${batchProgress.done}/${batchProgress.total}…`
                    : `Aprovar todas rejeitadas (${rejectedCount})`}
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        ) : null}

        {stats.pendingCount > 0 ? (
          <Banner
            title={`${stats.pendingCount} avaliação(ões) aguardando aprovação`}
            tone="warning"
            action={{
              content: "Ver só pendentes",
              url: paths.reviewsPending,
            }}
          >
            <BlockStack gap="300">
              <p>
                Use <strong>Aprovar</strong> em cada linha ou aprove/rejeite todas de uma vez (
                {MODERATION_BATCH_SIZE} por lote).
              </p>
              <InlineStack gap="200" wrap>
                <Button
                  variant="primary"
                  onClick={handleApproveAll}
                  loading={isBatchRunning}
                  disabled={isBatchRunning}
                >
                  {isBatchRunning && batchProgress
                    ? `Aprovando ${batchProgress.done}/${batchProgress.total}…`
                    : `Aprovar todas (${stats.pendingCount})`}
                </Button>
                <Button
                  tone="critical"
                  onClick={handleRejectAll}
                  disabled={isBatchRunning}
                >
                  Rejeitar todas ({stats.pendingCount})
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            {reviews.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação"
                action={{ content: "Criar avaliação", url: paths.reviewsNew }}
                secondaryAction={{ content: "Voltar ao painel", url: paths.app }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Crie avaliações para exibir no bloco <strong>Avaliações VCOM</strong> do
                  tema. Escolha homepage ou produto ao salvar.
                </p>
              </EmptyState>
            ) : (
              <Box overflowX="scroll">
                <Card padding="0">
                  <IndexTable
                    itemCount={reviews.length}
                    headings={[
                      { title: "Autor / nota" },
                      { title: "Avaliação" },
                      { title: "Status" },
                      { title: "Ações", alignment: "end" },
                    ]}
                    selectable={false}
                  >
                    {reviews.map((r, i) => (
                      <IndexTable.Row id={r.id} key={r.id} position={i}>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {r.author}
                            </Text>
                            {r.time ? (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {r.time}
                              </Text>
                            ) : null}
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
                              {truncate(r.body, 100)}
                            </Text>
                            <InlineStack gap="150" wrap>
                              {r.verified_buyer ? (
                                <Badge tone="success">Verified</Badge>
                              ) : null}
                              {r.images.length > 0 ? (
                                <Badge tone="info">{`${r.images.length} foto(s)`}</Badge>
                              ) : null}
                              {r.placement === "product" ? (
                                <Badge tone="info">Produto</Badge>
                              ) : null}
                            </InlineStack>
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge
                            tone={
                              r.status === "approved"
                                ? "success"
                                : r.status === "pending"
                                  ? "attention"
                                  : "critical"
                            }
                          >
                            {r.status === "approved"
                              ? "Publicada"
                              : r.status === "pending"
                                ? "Pendente"
                                : "Rejeitada"}
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
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
