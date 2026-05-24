import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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
  listPendingReviews,
  rejectAllPendingReviews,
  rejectReview,
} from "../lib/reviews.server";
import { ReviewStars } from "../components/ReviewStars";
import { ReviewModerationActions } from "../components/ReviewModerationActions";

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

  if (intent === "approveAll") {
    await approveAllPendingReviews(admin);
    return redirect("/app/reviews");
  }

  if (intent === "rejectAll") {
    await rejectAllPendingReviews(admin);
    return redirect("/app/reviews");
  }

  if (!id) return redirect("/app/reviews/pending");

  if (intent === "approve") {
    await approveReview(admin, id);
  } else if (intent === "reject") {
    await rejectReview(admin, id);
  } else if (intent === "delete") {
    await deleteReview(admin, id);
  }

  return redirect("/app/reviews/pending");
};

function truncate(text: string, max: number) {
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function PendingReviewsPage() {
  const { pending } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const post = useCallback(
    (data: Record<string, string>) => {
      submit(data, { method: "post" });
    },
    [submit],
  );

  const handleApproveAll = useCallback(() => {
    if (
      !window.confirm(
        `Aprovar todas as ${pending.length} avaliações? Elas passarão a aparecer na vitrine.`,
      )
    ) {
      return;
    }
    post({ intent: "approveAll" });
  }, [post, pending.length]);

  const handleRejectAll = useCallback(() => {
    if (
      !window.confirm(
        `Rejeitar todas as ${pending.length} avaliações? Não serão exibidas na loja.`,
      )
    ) {
      return;
    }
    post({ intent: "rejectAll" });
  }, [post, pending.length]);

  return (
    <Page
      title="Aprovação pendente"
      subtitle={`${pending.length} aguardando moderação`}
      backAction={{ url: "/app/reviews" }}
      primaryAction={
        pending.length > 0
          ? {
              content: `Aprovar todas (${pending.length})`,
              onAction: handleApproveAll,
            }
          : undefined
      }
      secondaryActions={
        pending.length > 0
          ? [
              {
                content: `Rejeitar todas (${pending.length})`,
                onAction: handleRejectAll,
              },
              { content: "Ver todas", url: "/app/reviews" },
            ]
          : [{ content: "Ver todas", url: "/app/reviews" }]
      }
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Avaliações geradas por IA ou enviadas pelo cliente só aparecem na vitrine
              depois de <strong>Aprovar</strong>.
            </Banner>

            {pending.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação pendente"
                action={{ content: "Ver todas", url: "/app/reviews" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Quando houver avaliações aguardando, elas aparecerão aqui.</p>
              </EmptyState>
            ) : (
              <Box overflowX="scroll">
                <Card padding="0">
                  <IndexTable
                    itemCount={pending.length}
                    headings={[
                      { title: "Cliente / nota" },
                      { title: "Avaliação" },
                      { title: "Destino" },
                      { title: "Ações", alignment: "end" },
                    ]}
                    selectable={false}
                  >
                    {pending.map((r, i) => (
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
                            editUrl={`/app/reviews/${encodeURIComponent(r.id)}`}
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
