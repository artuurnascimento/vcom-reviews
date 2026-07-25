import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  EmptyState,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getProductReviewGroup } from "../lib/reviews-by-product.server";
import { ReviewStars } from "../components/ReviewStars";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const productId = params.productId || "";
  const group = await getProductReviewGroup(admin, productId);
  if (!group) {
    return json({ group: null as null }, { status: 404 });
  }
  return json({ group });
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ProductReviewsDetail() {
  const { group } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const paths = useAppPaths();

  if (!group) {
    return (
      <Page
        title="Produto não encontrado"
        backAction={{ content: "Por produto", onAction: () => navigate(paths.products) }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Nenhuma avaliação encontrada para este produto"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>O produto pode ter sido removido ou ainda não tem avaliações.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title={group.title}
      subtitle={`${group.count} ${group.count === 1 ? "avaliação" : "avaliações"} · nota média ${group.avg.toFixed(1)}`}
      backAction={{ content: "Por produto", onAction: () => navigate(paths.products) }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <BlockStack gap="0">
              {group.reviews.map((r, i) => (
                <Box key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <Box padding="400">
                    <BlockStack gap="200">
                      <InlineStack gap="300" blockAlign="center" wrap={false}>
                        <ReviewStars rating={r.rating} size={16} />
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {r.rating.toFixed(1)}
                        </Text>
                        {r.verified_buyer ? (
                          <Badge tone="success">Verified</Badge>
                        ) : null}
                        {r.status !== "approved" ? (
                          <Badge tone={r.status === "pending" ? "attention" : "critical"}>
                            {r.status === "pending" ? "Pendente" : "Rejeitada"}
                          </Badge>
                        ) : null}
                      </InlineStack>

                      {r.title ? (
                        <Text as="h3" variant="headingSm">
                          {r.title}
                        </Text>
                      ) : null}
                      {r.body ? (
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {r.body}
                        </Text>
                      ) : null}

                      {r.images && r.images.length > 0 ? (
                        <InlineStack gap="200">
                          {r.images.map((img, idx) => (
                            <Thumbnail
                              key={idx}
                              source={img}
                              alt={`Foto ${idx + 1}`}
                              size="small"
                            />
                          ))}
                        </InlineStack>
                      ) : null}

                      <Text as="span" variant="bodySm" tone="subdued">
                        {r.author}
                        {r.time ? ` · ${formatDate(r.time)}` : ""}
                      </Text>
                    </BlockStack>
                  </Box>
                </Box>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
