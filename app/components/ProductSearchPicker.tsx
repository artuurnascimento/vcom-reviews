import {
  BlockStack,
  Box,
  Icon,
  InlineStack,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon, SearchIcon } from "@shopify/polaris-icons";
import { useCallback } from "react";

export type ProductSearchResult = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  status: string;
  imageUrl: string;
  imageAlt: string;
};

type Props = {
  query: string;
  selectedId: string;
  selectedLabel?: string;
  results: ProductSearchResult[];
  loading?: boolean;
  listTitle?: string;
  onQueryChange: (query: string) => void;
  onSelect: (product: ProductSearchResult) => void;
  onClearSelection?: () => void;
};

export function ProductSearchPicker({
  query,
  selectedId,
  selectedLabel,
  results,
  loading = false,
  listTitle,
  onQueryChange,
  onSelect,
  onClearSelection,
}: Props) {
  const handlePick = useCallback(
    (product: ProductSearchResult) => {
      onSelect(product);
    },
    [onSelect],
  );

  const panelTitle =
    listTitle ??
    (loading
      ? "Buscando…"
      : results.length
        ? "Produtos encontrados"
        : "Nenhum produto");

  return (
    <BlockStack gap="300">
      {selectedId && selectedLabel ? (
        <Box
          padding="300"
          borderRadius="200"
          background="bg-surface-secondary"
          borderWidth="025"
          borderColor="border"
        >
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Text as="p" variant="bodySm">
              Selecionado: <strong>{selectedLabel}</strong>
            </Text>
            {onClearSelection ? (
              <button
                type="button"
                onClick={onClearSelection}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#1d8a42",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Trocar
              </button>
            ) : null}
          </InlineStack>
        </Box>
      ) : null}

      <TextField
        label="Buscar produto"
        value={query}
        onChange={onQueryChange}
        prefix={<Icon source={SearchIcon} tone="base" />}
        placeholder="Digite nome, SKU ou tipo do produto…"
        autoComplete="off"
        clearButton
        onClearButtonClick={() => onQueryChange("")}
        helpText="Busca em tempo real no catálogo da loja"
      />

      <Box
        borderWidth="025"
        borderColor="border"
        borderRadius="200"
        background="bg-surface"
        padding="200"
        minHeight="120px"
      >
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            {panelTitle}
            {results.length > 0 ? ` (${results.length})` : ""}
          </Text>

          {loading ? (
            <Text as="p" variant="bodySm">
              Carregando catálogo…
            </Text>
          ) : results.length === 0 ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Nenhum produto encontrado. Tente outro termo ou verifique se a loja tem
              produtos ativos.
            </Text>
          ) : (
            <div
              style={{
                maxHeight: 280,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {results.map((product) => {
                const isSelected = product.id === selectedId;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handlePick(product)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 10px",
                      border: isSelected
                        ? "1px solid #1d8a42"
                        : "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 8,
                      background: isSelected ? "rgba(29,138,66,0.08)" : "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {product.imageUrl ? (
                      <Thumbnail
                        source={product.imageUrl}
                        alt={product.imageAlt}
                        size="small"
                      />
                    ) : (
                      <Box
                        background="bg-surface-secondary"
                        borderRadius="200"
                        minWidth="40px"
                        minHeight="40px"
                      >
                        <Icon source={ImageIcon} tone="subdued" />
                      </Box>
                    )}
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <InlineStack gap="200">
                        {product.productType ? (
                          <Text as="span" variant="bodySm" tone="subdued">
                            {product.productType}
                          </Text>
                        ) : null}
                        <Text as="span" variant="bodySm" tone="subdued">
                          {product.status}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </button>
                );
              })}
            </div>
          )}
        </BlockStack>
      </Box>
    </BlockStack>
  );
}
