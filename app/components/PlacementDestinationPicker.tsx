import { BlockStack, Box, InlineGrid, Text } from "@shopify/polaris";
import type { ReviewPlacement } from "../lib/constants";

type Props = {
  value: ReviewPlacement;
  shopName: string;
  productTitle?: string;
  onChange: (placement: ReviewPlacement) => void;
};

export function PlacementDestinationPicker({
  value,
  shopName,
  productTitle,
  onChange,
}: Props) {
  const isHomepage = value === "homepage";
  const isProduct = value === "product";

  return (
    <BlockStack gap="300">
      <Text as="h2" variant="headingMd">
        Vincular avaliações a
      </Text>
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
        <button
          type="button"
          onClick={() => onChange("homepage")}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "block",
            width: "100%",
          }}
        >
          <Box
            padding="400"
            borderRadius="300"
            background={isHomepage ? "bg-surface-success" : "bg-surface-secondary"}
            borderWidth="025"
            borderColor={isHomepage ? "border-success" : "border"}
            shadow={isHomepage ? "200" : undefined}
          >
            <BlockStack gap="200">
              <Text as="span" variant="headingSm" fontWeight="bold">
                Página inicial
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Carrossel / grid de avaliações na homepage de {shopName}. Produto de
                referência é opcional.
              </Text>
              {isHomepage ? (
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  ✓ Selecionado
                </Text>
              ) : null}
            </BlockStack>
          </Box>
        </button>

        <button
          type="button"
          onClick={() => onChange("product")}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "block",
            width: "100%",
          }}
        >
          <Box
            padding="400"
            borderRadius="300"
            background={isProduct ? "bg-surface-info" : "bg-surface-secondary"}
            borderWidth="025"
            borderColor={isProduct ? "border-info" : "border"}
            shadow={isProduct ? "200" : undefined}
          >
            <BlockStack gap="200">
              <Text as="span" variant="headingSm" fontWeight="bold">
                Página do produto
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Avaliações na ficha do produto escolhido. É obrigatório selecionar o
                produto na aba Referência.
              </Text>
              {isProduct ? (
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  ✓ Selecionado
                  {productTitle ? ` · ${productTitle}` : ""}
                </Text>
              ) : null}
            </BlockStack>
          </Box>
        </button>
      </InlineGrid>
    </BlockStack>
  );
}
