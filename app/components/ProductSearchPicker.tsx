import { Autocomplete, Icon, Thumbnail } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  selectedId: string;
  selectedTitle?: string;
  results: ProductSearchResult[];
  loading?: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (product: ProductSearchResult) => void;
  onClear?: () => void;
};

export function ProductSearchPicker({
  selectedId,
  selectedTitle,
  results,
  loading = false,
  onQueryChange,
  onSelect,
  onClear,
}: Props) {
  const [inputValue, setInputValue] = useState(selectedTitle || "");

  useEffect(() => {
    if (selectedTitle) {
      setInputValue(selectedTitle);
    }
  }, [selectedTitle]);

  const options = useMemo(
    () =>
      results.map((product) => ({
        value: product.id,
        label: product.title,
        media: (
          <Thumbnail
            source={product.imageUrl || ""}
            alt={product.imageAlt}
            size="small"
          />
        ),
      })),
    [results],
  );

  const updateSelection = useCallback(
    (selected: string[]) => {
      const id = selected[0];
      if (!id) {
        onClear?.();
        setInputValue("");
        return;
      }
      const product = results.find((p) => p.id === id);
      if (product) {
        setInputValue(product.title);
        onSelect(product);
      }
    },
    [results, onClear, onSelect],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      onQueryChange(value);
      if (!value.trim()) {
        onClear?.();
      }
    },
    [onClear, onQueryChange],
  );

  const textField = (
    <Autocomplete.TextField
      onChange={handleInputChange}
      label="Buscar produto"
      value={inputValue}
      prefix={<Icon source={SearchIcon} tone="base" />}
      placeholder="Digite nome, SKU ou tipo do produto…"
      autoComplete="off"
      clearButton
      onClearButtonClick={() => {
        setInputValue("");
        onClear?.();
        onQueryChange("");
      }}
      helpText="Busca em tempo real no catálogo da loja"
    />
  );

  return (
    <Autocomplete
      options={options}
      selected={selectedId ? [selectedId] : []}
      onSelect={updateSelection}
      textField={textField}
      loading={loading}
      listTitle={results.length ? "Produtos encontrados" : "Nenhum produto"}
    />
  );
}
