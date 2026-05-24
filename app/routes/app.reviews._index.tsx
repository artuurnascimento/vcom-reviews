import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirectWithEmbeddedSearch } from "../lib/embedded-app-path.server";
import { useLoaderData } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
import { useCallback } from "react";
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
  approveAllPendingReviews,
  approveReview,
  deleteReview,
  listReviews,
  rejectAllPendingReviews,
  rejectReview,
} from "../lib/reviews.server";
import { getDashboardStats } from "../lib/dashboard.server";
import { StatCard } from "../components/StatCard";
import { ReviewStars } from "../components/ReviewStars";
import { ReviewModerationActions } from "../components/ReviewModerationActions";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [stats, { reviews }] = await Promise.all([
    getDashboardStats(admin),
    listReviews(admin, { first: 250 }),
  ]);
  return { reviews, stats };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");

  if (intent === "approveAll") {
    await approveAllPendingReviews(admin);
    return redirectWithEmbeddedSearch(request, "/app/reviews");
  }

  if (intent === "rejectAll") {
    await rejectAllPendingReviews(admin);
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
  const { reviews, stats } = useLoaderData<typeof loader>();
  const submit = useEmbeddedSubmit();

  const post = useCallback(
    (data: Record<string, string>) => {
      submit(data, { method: "post" });
    },
    [submit],
  );

  const handleApproveAll = useCallback(() => {
    if (
      !window.confirm(
        `Aprovar todas as ${stats.pendingCount} avaliações pendentes? Elas passarão a aparecer na vitrine.`,
      )
    ) {
      return;
    }
    post({ intent: "approveAll" });
  }, [post, stats.pendingCount]);

  const handleRejectAll = useCallback(() => {
    if (
      !window.confirm(
        `Rejeitar todas as ${stats.pendingCount} avaliações pendentes? Esta ação não publica na loja.`,
      )
    ) {
      return;
    }
    post({ intent: "rejectAll" });
  }, [post, stats.pendingCount]);

  return (
    <Page
      title="Avaliações"
      subtitle={`${stats.totalReviews} publicadas · ${stats.pendingCount} pendentes · média ${stats.averageRating}`}
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
                Use <strong>Aprovar</strong> em cada linha ou aprove/rejeite todas de uma vez.
              </p>
              <InlineStack gap="200" wrap>
                <Button variant="primary" onClick={handleApproveAll}>
                  Aprovar todas ({stats.pendingCount})
                </Button>
                <Button tone="critical" onClick={handleRejectAll}>
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
