import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Text,
  Badge,
  EmptyState,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getReviewsByProduct } from "../lib/reviews-by-product.server";
import { ReviewStars } from "../components/ReviewStars";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const groups = await getReviewsByProduct(admin);
  return {
    products: groups.map((g) => ({
      numericId: g.numericId,
      title: g.title,
      image: g.image,
      count: g.count,
      avg: g.avg,
    })),
  };
};

export default function ProductsIndex() {
  const { products } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const paths = useAppPaths();

  return (
    <Page
      title="Avaliações por produto"
      subtitle="Clique em um produto para ver todas as suas avaliações"
      backAction={{ content: "Painel", onAction: () => navigate(paths.app) }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {products.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação com produto ainda"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Assim que houver avaliações vinculadas a um produto, elas
                  aparecerão aqui agrupadas por produto.
                </p>
              </EmptyState>
            ) : (
              <ResourceList
                resourceName={{ singular: "produto", plural: "produtos" }}
                items={products}
                renderItem={(product) => {
                  const { numericId, title, image, count, avg } = product;
                  return (
                    <ResourceItem
                      id={numericId}
                      onClick={() => navigate(paths.productReviews(numericId))}
                      media={
                        <Thumbnail
                          source={
                            image ||
                            "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                          }
                          alt={title}
                          size="medium"
                        />
                      }
                      accessibilityLabel={`Ver avaliações de ${title}`}
                    >
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {title}
                        </Text>
                        <InlineStack gap="300" blockAlign="center">
                          <ReviewStars rating={avg} size={16} />
                          <Text as="span" variant="bodySm">
                            {avg.toFixed(1)}
                          </Text>
                          <Badge tone="success">{`${count} ${
                            count === 1 ? "avaliação" : "avaliações"
                          }`}</Badge>
                        </InlineStack>
                      </BlockStack>
                    </ResourceItem>
                  );
                }}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
