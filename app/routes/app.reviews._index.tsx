import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { deleteReview, listReviews } from "../lib/reviews.server";
import { getDashboardStats } from "../lib/dashboard.server";
import { StatCard } from "../components/StatCard";
import { ReviewStars } from "../components/ReviewStars";

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
  const intent = form.get("intent");
  const id = form.get("id") as string;
  if (intent === "delete" && id) {
    await deleteReview(admin, id);
  }
  return redirect("/app/reviews");
};

function truncate(text: string, max: number) {
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function ReviewsIndex() {
  const { reviews, stats } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  return (
    <Page
      title="Avaliações"
      subtitle={`${stats.totalReviews} no total · média ${stats.averageRating}`}
      backAction={{ url: "/app" }}
      primaryAction={{ content: "Nova avaliação", url: "/app/reviews/new" }}
      secondaryActions={[
        {
          content: `Pendentes (${stats.pendingCount})`,
          url: "/app/reviews/pending",
        },
      ]}
    >
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
          <StatCard label="Total" value={stats.totalReviews} />
          <StatCard label="Média" value={stats.averageRating} />
          <StatCard label="Homepage" value={stats.homepagePublished} />
          <StatCard label="Com fotos" value={stats.withImagesCount} />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            {reviews.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação"
                action={{ content: "Criar avaliação", url: "/app/reviews/new" }}
                secondaryAction={{ content: "Voltar ao painel", url: "/app" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Crie avaliações para exibir no bloco <strong>Avaliações VCOM</strong> do
                  tema. Escolha homepage ou produto ao salvar.
                </p>
              </EmptyState>
            ) : (
              <Card padding="0">
                <IndexTable
                  itemCount={reviews.length}
                  headings={[
                    { title: "Autor" },
                    { title: "Avaliação" },
                    { title: "Nota" },
                    { title: "Status" },
                    { title: "Extras" },
                    { title: "Ações" },
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
                            {truncate(r.body, 90)}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200" blockAlign="center">
                          <ReviewStars rating={r.rating} size={16} />
                          <Text as="span" variant="bodySm">
                            {r.rating}
                          </Text>
                        </InlineStack>
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
                        <InlineStack gap="200">
                          {r.verified_buyer ? (
                            <Badge tone="success">Verified</Badge>
                          ) : null}
                          {r.images.length > 0 ? (
                            <Badge tone="info">{r.images.length} foto(s)</Badge>
                          ) : null}
                        </InlineStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button url={`/app/reviews/${encodeURIComponent(r.id)}`} size="slim">
                            Editar
                          </Button>
                          <Button
                            tone="critical"
                            size="slim"
                            onClick={() =>
                              submit({ intent: "delete", id: r.id }, { method: "post" })
                            }
                          >
                            Apagar
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </Card>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
