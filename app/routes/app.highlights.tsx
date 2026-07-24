import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getFileImageUrls } from "../lib/reviews.server";
import { getApprovedProductReviewsByShop } from "../lib/review-proxy-cache.server";
import {
  getProductTitlesByIds,
  getTopProductReviews,
  TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP,
} from "../lib/top-reviews.server";
import { buildThemeEditorDeepLink } from "../lib/theme-homepage.server";
import { ReviewStars } from "../components/ReviewStars";
import { StatCard } from "../components/StatCard";

const PREVIEW_LIMIT = 24;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const approved = await getApprovedProductReviewsByShop(admin, session.shop);
  const top = await getTopProductReviews(admin, session.shop, {
    sort: "rating_high",
    limit: PREVIEW_LIMIT,
    perProductCap: TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP,
  });

  const productIds = Array.from(
    new Set(top.map((r) => r.productId).filter((id): id is string => Boolean(id))),
  );
  const [titles, imageUrls] = await Promise.all([
    getProductTitlesByIds(admin, productIds),
    getFileImageUrls(admin, top.flatMap((r) => r.images)),
  ]);

  const distinctProducts = new Set(
    approved.map((r) => r.productId).filter(Boolean),
  ).size;

  return {
    themeEditorUrl: buildThemeEditorDeepLink(session.shop),
    totalApproved: approved.length,
    distinctProducts,
    shown: top.length,
    reviews: top.map((r) => ({
      id: r.id,
      rating: r.rating,
      author: r.author,
      title: r.title,
      body: r.body,
      verified_buyer: r.verified_buyer,
      productTitle: (r.productId && titles[r.productId]) || "Produto",
      thumbnail: r.images.map((id) => imageUrls[id]).find(Boolean) || null,
    })),
  };
};

export default function Highlights() {
  const { themeEditorUrl, totalApproved, distinctProducts, shown, reviews } =
    useLoaderData<typeof loader>();

  return (
    <Page title="Destaques">
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <Text as="p" variant="bodyMd">
              As <strong>principais avaliações</strong> reúnem as melhores notas de{" "}
              <strong>todos os produtos</strong> com avaliações aprovadas. Adicione a
              seção <strong>“Principais avaliações”</strong> no editor de tema (ex.: na
              página inicial) para exibi-las na loja.
            </Text>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <StatCard
              label="Avaliações de produto aprovadas"
              value={totalApproved}
              tone="success"
            />
            <StatCard label="Produtos com avaliações" value={distinctProducts} />
            <StatCard
              label="Exibidas neste destaque"
              value={shown}
              hint={`máx. ${TOP_REVIEWS_DEFAULT_PER_PRODUCT_CAP} por produto`}
            />
          </InlineGrid>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Principais avaliações (maior nota primeiro)
                </Text>
                <Button url={themeEditorUrl} target="_blank" variant="primary">
                  Adicionar seção no tema
                </Button>
              </InlineStack>

              {reviews.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    Ainda não há avaliações de produto aprovadas. Crie avaliações em
                    “Avaliações” ou aprove as pendentes para que apareçam aqui.
                  </Text>
                </Box>
              ) : (
                <InlineGrid columns={{ xs: 1, sm: 2, lg: 3 }} gap="300">
                  {reviews.map((r) => (
                    <Box
                      key={r.id}
                      padding="300"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                      background="bg-surface"
                    >
                      <BlockStack gap="150">
                        <InlineStack align="space-between" blockAlign="center">
                          <ReviewStars rating={r.rating} size={16} />
                          {r.verified_buyer ? (
                            <Badge tone="success">Verificado</Badge>
                          ) : null}
                        </InlineStack>
                        <Badge>{r.productTitle}</Badge>
                        {r.title ? (
                          <Text as="h3" variant="headingSm">
                            {r.title}
                          </Text>
                        ) : null}
                        <Text as="p" variant="bodySm" tone="subdued">
                          {r.body.length > 160 ? `${r.body.slice(0, 160)}…` : r.body}
                        </Text>
                        {r.thumbnail ? (
                          <img
                            src={r.thumbnail}
                            alt=""
                            width={64}
                            height={64}
                            loading="lazy"
                            style={{
                              width: 64,
                              height: 64,
                              objectFit: "cover",
                              borderRadius: 8,
                            }}
                          />
                        ) : null}
                        <Text as="p" variant="bodySm">
                          — {r.author || "Cliente"}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineGrid>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
