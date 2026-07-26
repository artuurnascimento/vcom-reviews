import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
  Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getDashboardStats } from "../lib/dashboard.server";
import { getReviewsByProduct } from "../lib/reviews-by-product.server";
import { publishAllReviewMetaobjects } from "../lib/metaobject-publish.server";
import { syncStorefrontReviewStats } from "../lib/storefront-stats.server";
import { StatCard, RatingBar } from "../components/StatCard";
import { ReviewStars } from "../components/ReviewStars";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  await publishAllReviewMetaobjects(admin);
  await syncStorefrontReviewStats(admin);
  const [stats, groups] = await Promise.all([
    getDashboardStats(admin),
    getReviewsByProduct(admin),
  ]);
  const productGroups = groups.map((g) => ({
    numericId: g.numericId,
    title: g.title,
    image: g.image,
    count: g.count,
    avg: g.avg,
  }));
  return { ...stats, productGroups };
};

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function AppHome() {
  const stats = useLoaderData<typeof loader>();
  const paths = useAppPaths();
  const navigate = useNavigate();

  return (
    <Page
      title="Painel"
      subtitle={`Avaliações manuais · ${stats.shopName}`}
      primaryAction={{ content: "Nova avaliação", url: paths.reviewsNew }}
      secondaryActions={[
        { content: "Ver todas", url: paths.reviews },
        { content: "Por produto", url: paths.products },
        { content: "Gerar com IA", url: paths.reviewsGenerate },
        { content: "Aparência", url: paths.appearance },
        { content: "Configuração", url: paths.setup },
      ]}
    >
      <BlockStack gap="500">
        {!stats.setupReady ? (
          <Banner
            tone="warning"
            title="Configuração pendente"
            action={{ content: "Executar configuração", url: paths.setup }}
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
            action={{ content: "Moderar", url: paths.reviewsPending }}
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
            <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Avaliações recentes
                  </Text>
                  <Button url={paths.reviews} variant="plain">
                    Ver todas
                  </Button>
                </InlineStack>
                {stats.recentReviews.length === 0 ? (
                  <EmptyState
                    heading="Nenhuma avaliação ainda"
                    action={{ content: "Criar avaliação", url: paths.reviewsNew }}
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
                            url={paths.reviewEdit(r.id)}
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

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Avaliações por produto
                  </Text>
                  <Button url={paths.products} variant="plain">
                    Ver todos
                  </Button>
                </InlineStack>
                {stats.productGroups.length === 0 ? (
                  <Text as="p" tone="subdued">
                    Nenhuma avaliação vinculada a um produto ainda.
                  </Text>
                ) : (
                  <BlockStack gap="0">
                    {stats.productGroups.map((p, i) => (
                      <Box key={p.numericId}>
                        {i > 0 ? <Divider /> : null}
                        <div
                          role="button"
                          tabIndex={0}
                          style={{ cursor: "pointer" }}
                          onClick={() => navigate(paths.productReviews(p.numericId))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(paths.productReviews(p.numericId));
                            }
                          }}
                        >
                          <Box padding="300">
                            <InlineStack
                              gap="300"
                              blockAlign="center"
                              wrap={false}
                            >
                              <Thumbnail
                                source={
                                  p.image ||
                                  "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                }
                                alt={p.title}
                                size="small"
                              />
                              <Box width="100%">
                                <BlockStack gap="100">
                                  <Text
                                    as="span"
                                    variant="bodyMd"
                                    fontWeight="semibold"
                                  >
                                    {p.title}
                                  </Text>
                                  <InlineStack gap="200" blockAlign="center">
                                    <ReviewStars rating={p.avg} size={14} />
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      {p.avg.toFixed(1)}
                                    </Text>
                                    <Badge tone="success">{`${p.count} ${
                                      p.count === 1 ? "avaliação" : "avaliações"
                                    }`}</Badge>
                                  </InlineStack>
                                </BlockStack>
                              </Box>
                            </InlineStack>
                          </Box>
                        </div>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Distribuição de notas
                  </Text>
                  {stats.totalReviews > 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Notas como 4,6 ou 4,9 entram na barra de 4 estrelas; só 5,0 na de 5.
                    </Text>
                  ) : null}
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
                    <Button url={paths.reviewsNew} variant="primary" fullWidth>
                      Nova avaliação
                    </Button>
                    <Button url={paths.reviewsGenerate} fullWidth>
                      Gerar com IA
                    </Button>
                    <Button url={paths.appearance} fullWidth>
                      Aparência
                    </Button>
                    <Button url={paths.reviews} fullWidth>
                      Gerenciar avaliações
                    </Button>
                    <Button url={paths.products} fullWidth>
                      Avaliações por produto
                    </Button>
                    <Button url={paths.setup} fullWidth>
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
                        {`${String(stats.homepagePublished)} na homepage`}
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
