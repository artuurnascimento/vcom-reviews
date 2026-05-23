import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  Banner,
  InlineGrid,
  InlineStack,
  Badge,
  Divider,
  Box,
  IndexTable,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getDashboardStats } from "../lib/dashboard.server";
import { StatCard, RatingBar } from "../components/StatCard";
import { ReviewStars } from "../components/ReviewStars";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return getDashboardStats(admin);
};

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function AppHome() {
  const stats = useLoaderData<typeof loader>();

  return (
    <Page
      title="Painel"
      subtitle={`Avaliações manuais · ${stats.shopName}`}
      primaryAction={{ content: "Nova avaliação", url: "/app/reviews/new" }}
      secondaryActions={[
        { content: "Ver todas", url: "/app/reviews" },
        { content: "Configuração", url: "/app/setup" },
      ]}
    >
      <BlockStack gap="500">
        {!stats.setupReady ? (
          <Banner
            tone="warning"
            title="Configuração pendente"
            action={{ content: "Executar configuração", url: "/app/setup" }}
          >
            <p>
              Antes de publicar reviews na loja, execute a configuração para criar o
              metaobject <code>review</code> (sem metafields).
            </p>
          </Banner>
        ) : null}

        {stats.pendingCount > 0 ? (
          <Banner
            tone="warning"
            title={`${stats.pendingCount} avaliação(ões) aguardando aprovação`}
            action={{ content: "Moderar", url: "/app/reviews/pending" }}
          >
            <p>Clientes enviaram reviews pela loja. Aprove para publicar na vitrine.</p>
          </Banner>
        ) : null}

        {stats.totalReviews === 0 ? (
          <Banner tone="info" title="Comece por aqui">
            <p>
              Crie sua primeira avaliação e adicione o bloco <strong>Avaliações VCOM</strong>{" "}
              no tema (homepage ou produto). O visual segue a seção Trustpilot do tema VCOM.
            </p>
          </Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="400">
          <StatCard
            label="Total de avaliações"
            value={stats.totalReviews}
            hint="Metaobjects criados no app"
          />
          <StatCard
            label="Nota média"
            value={stats.averageRating}
            hint="Todas as avaliações"
            tone={stats.averageRating !== "—" ? "success" : "subdued"}
          />
          <StatCard
            label="Na homepage"
            value={stats.homepagePublished}
            hint="placement: homepage · aprovadas"
          />
          <StatCard
            label="Verified Buyer"
            value={stats.verifiedCount}
            hint={`${stats.withImagesCount} com fotos`}
          />
        </InlineGrid>

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Avaliações recentes
                  </Text>
                  <Button url="/app/reviews" variant="plain">
                    Ver todas
                  </Button>
                </InlineStack>
                {stats.recentReviews.length === 0 ? (
                  <EmptyState
                    heading="Nenhuma avaliação ainda"
                    action={{ content: "Criar avaliação", url: "/app/reviews/new" }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Publique reviews na homepage ou em produtos específicos.</p>
                  </EmptyState>
                ) : (
                  <IndexTable
                    itemCount={stats.recentReviews.length}
                    headings={[
                      { title: "Autor" },
                      { title: "Nota" },
                      { title: "Resumo" },
                      { title: "" },
                    ]}
                    selectable={false}
                  >
                    {stats.recentReviews.map((r, i) => (
                      <IndexTable.Row id={r.id} key={r.id} position={i}>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {r.author}
                            </Text>
                            {r.verified_buyer ? (
                              <Badge tone="success" size="small">
                                Verified
                              </Badge>
                            ) : null}
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <InlineStack gap="200" blockAlign="center">
                            <ReviewStars rating={r.rating} size={16} />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {r.rating}
                            </Text>
                          </InlineStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <BlockStack gap="100">
                            {r.title ? (
                              <Text as="span" variant="bodyMd" fontWeight="medium">
                                {truncate(r.title, 40)}
                              </Text>
                            ) : null}
                            <Text as="span" variant="bodySm" tone="subdued">
                              {truncate(r.body, 80)}
                            </Text>
                          </BlockStack>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Button
                            url={`/app/reviews/${encodeURIComponent(r.id)}`}
                            size="slim"
                          >
                            Editar
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Distribuição de notas
                  </Text>
                  {stats.totalReviews === 0 ? (
                    <Text as="p" tone="subdued">
                      Sem dados ainda.
                    </Text>
                  ) : (
                    <BlockStack gap="300">
                      {([5, 4, 3, 2, 1] as const).map((stars) => (
                        <RatingBar
                          key={stars}
                          stars={stars}
                          count={stats.ratingBuckets[stars]}
                          total={stats.totalReviews}
                        />
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Ações rápidas
                  </Text>
                  <BlockStack gap="200">
                    <Button url="/app/reviews/new" variant="primary" fullWidth>
                      Nova avaliação
                    </Button>
                    <Button url="/app/reviews" fullWidth>
                      Gerenciar avaliações
                    </Button>
                    <Button url="/app/setup" fullWidth>
                      Configuração da loja
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Vitrine (tema VCOM)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    No Theme Editor, adicione o bloco de app{" "}
                    <strong>Avaliações VCOM</strong>:
                  </Text>
                  <Box
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <Text as="p" variant="bodySm" fontWeight="medium">
                      shopify://apps/vcom-reviwers/blocks/product-reviews
                    </Text>
                  </Box>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={stats.setupReady ? "success" : "warning"}>
                        {stats.setupReady ? "Metaobject OK" : "Setup pendente"}
                      </Badge>
                      <Badge tone={stats.homepagePublished > 0 ? "success" : "info"}>
                        {stats.homepagePublished} na homepage
                      </Badge>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Fonte: <code>shop.metaobjects.review</code> filtrado por status e
                      placement
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
