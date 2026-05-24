import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineGrid,
  InlineStack,
  SkeletonBodyText,
  SkeletonThumbnail,
  Text,
  Thumbnail,
} from "@shopify/polaris";

type ProductPreview = {
  id: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  images: Array<{ url: string; altText: string }>;
};

type Props = {
  product: ProductPreview | null;
  loading?: boolean;
  onChangeProduct?: () => void;
  emptyHint?: string;
};

export function ProductHeroCard({ product, loading, onChangeProduct, emptyHint }: Props) {
  if (loading) {
    return (
      <Box
        padding="400"
        borderRadius="300"
        background="bg-surface-secondary"
        borderWidth="025"
        borderColor="border"
      >
        <InlineGrid columns={{ xs: "auto 1fr" }} gap="400">
          <SkeletonThumbnail size="large" />
          <BlockStack gap="200">
            <SkeletonBodyText lines={3} />
          </BlockStack>
        </InlineGrid>
      </Box>
    );
  }

  if (!product) {
    return (
      <Box
        padding="600"
        borderRadius="300"
        background="bg-surface-secondary"
        borderWidth="025"
        borderColor="border"
      >
        <BlockStack gap="200" inlineAlign="center">
          <Text as="p" variant="headingSm" alignment="center">
            Nenhum produto selecionado
          </Text>
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            {emptyHint ||
              "Use a busca para escolher um produto. A IA usa título, descrição e fotos."}
          </Text>
        </BlockStack>
      </Box>
    );
  }

  const cover = product.images[0]?.url || "";

  return (
    <Box
      padding="400"
      borderRadius="300"
      background="bg-surface-secondary"
      borderWidth="025"
      borderColor="border"
    >
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: "auto 1fr auto" }} gap="400" alignItems="start">
          <Thumbnail source={cover} alt={product.title} size="large" />
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">
              {product.title}
            </Text>
            <InlineStack gap="200" wrap>
              {product.productType ? (
                <Badge tone="info">{product.productType}</Badge>
              ) : null}
              {product.vendor ? <Badge>{product.vendor}</Badge> : null}
              <Badge tone="success">{`${product.images.length} foto(s)`}</Badge>
            </InlineStack>
            {product.description ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {product.description.slice(0, 280)}
                {product.description.length > 280 ? "…" : ""}
              </Text>
            ) : null}
          </BlockStack>
          {onChangeProduct ? (
            <Button size="slim" onClick={onChangeProduct}>
              Trocar
            </Button>
          ) : null}
        </InlineGrid>

        {product.images.length > 1 ? (
          <InlineStack gap="200" wrap>
            {product.images.slice(0, 6).map((img) => (
              <Thumbnail
                key={img.url}
                source={img.url}
                alt={img.altText || product.title}
                size="small"
              />
            ))}
          </InlineStack>
        ) : null}

        {product.tags.length > 0 ? (
          <InlineStack gap="150" wrap>
            {product.tags.slice(0, 6).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </InlineStack>
        ) : null}
      </BlockStack>
    </Box>
  );
}
