import {
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import {
  useEmbeddedFetcher,
  useEmbeddedSubmit,
} from "../hooks/useEmbeddedAppPath";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filterProductsByTerm } from "../lib/product-search.shared";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Checkbox,
  Divider,
  FormLayout,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Tabs,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  AI_AGE_RANGES,
  AI_COUNTRIES,
  AI_GENDERS,
  AI_LOCALES,
  AI_PRODUCT_TYPES,
  AI_TONES,
  DEFAULT_AI_TONE,
  type GeneratedAiReview,
  formatRatingRange,
  clampRating,
  getDefaultLocaleForCountry,
  getLocaleSelectOptions,
  labelForOption,
} from "../lib/ai-review-options";
import type { ReviewPlacement } from "../lib/constants";
import {
  isGenerateSuccess,
  productPreviewFromSearchRow,
  type GenerateLoaderData,
  type GenerateResult,
  type ProductPreview,
  type SearchProductsResult,
} from "../lib/reviews-generate.shared";
import { AiReviewPreviewCard } from "../components/AiReviewPreviewCard";
import {
  ProductSearchPicker,
  type ProductSearchResult,
} from "../components/ProductSearchPicker";
import { ProductHeroCard } from "../components/ProductHeroCard";
import { PlacementDestinationPicker } from "../components/PlacementDestinationPicker";
import { RatingRangeField } from "../components/RatingRangeField";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export { loader, action } from "../lib/reviews-generate-route.server";

const TABS = [
  { id: "product", content: "Referência" },
  { id: "style", content: "Estilo" },
  { id: "publish", content: "Quantidade" },
];

function getRouteErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === "string" && error.data) return error.data;
    if (error.data && typeof error.data === "object" && "message" in error.data) {
      return String((error.data as { message: unknown }).message);
    }
    return error.statusText || `Erro ${error.status}`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Erro ao abrir a geração com IA.";
}

export function ErrorBoundary() {
  const paths = useAppPaths();
  const error = useRouteError();
  const message = getRouteErrorMessage(error);

  return (
    <Page title="Gerar avaliações com IA" backAction={{ url: paths.reviews }}>
      <Banner tone="critical" title="Não foi possível abrir esta página">
        <p>{message}</p>
      </Banner>
      <Box paddingBlockStart="400">
        <Button url={paths.reviews}>Voltar às avaliações</Button>
      </Box>
    </Page>
  );
}

export default function GenerateReviewsPage() {
  const paths = useAppPaths();
  const {
    aiConfigured,
    shopName,
    loaderError,
    initialProducts,
    productsLoadError,
  } = useLoaderData<GenerateLoaderData>();
  const actionData = useActionData<GenerateResult>();
  const generateFetcher = useEmbeddedFetcher<GenerateResult>("vcom-generate-reviews");
  const searchFetcher = useEmbeddedFetcher<SearchProductsResult>("vcom-search-products");
  const saveSubmit = useEmbeddedSubmit();
  const generateAction = paths.reviewsGenerate;

  const [selectedTab, setSelectedTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteSearchResults, setRemoteSearchResults] = useState<
    ProductSearchResult[] | null
  >(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProductTitle, setSelectedProductTitle] = useState("");
  const lastRemoteQuery = useRef("");

  const [productType, setProductType] = useState("moda");
  const [customProductType, setCustomProductType] = useState("");
  const [productId, setProductId] = useState("");
  const [gender, setGender] = useState("random");
  const [ageRange, setAgeRange] = useState("random");
  const [tone, setTone] = useState(DEFAULT_AI_TONE);
  const [locale, setLocale] = useState("pt-BR");
  const [country, setCountry] = useState("Brasil");
  const [city, setCity] = useState("");
  const [ratingMin, setRatingMin] = useState(4.6);
  const [ratingMax, setRatingMax] = useState(5);
  const [count, setCount] = useState("3");
  const [placement, setPlacement] = useState<ReviewPlacement>("homepage");
  const [verifiedBuyer, setVerifiedBuyer] = useState(false);
  const [saveAsPending, setSaveAsPending] = useState(true);
  const [useProductImages, setUseProductImages] = useState(true);
  const [attachProductImages, setAttachProductImages] = useState(true);
  const [preview, setPreview] = useState<GeneratedAiReview[]>([]);
  const [productPreview, setProductPreview] = useState<ProductPreview | null>(null);

  const generateResult = isGenerateSuccess(generateFetcher.data)
    ? generateFetcher.data
    : isGenerateSuccess(actionData)
      ? actionData
      : null;

  useEffect(() => {
    if (isGenerateSuccess(generateFetcher.data)) {
      setPreview(generateFetcher.data.reviews);
    }
  }, [generateFetcher.data]);

  const catalogProducts = useMemo(() => initialProducts ?? [], [initialProducts]);

  const searchResults = useMemo(() => {
    const term = searchQuery.trim();
    if (!term) return catalogProducts;
    const local = filterProductsByTerm(catalogProducts, term);
    if (local.length > 0) return local;
    return remoteSearchResults ?? [];
  }, [searchQuery, catalogProducts, remoteSearchResults]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setRemoteSearchResults(null);
      lastRemoteQuery.current = "";
      setSearchError(productsLoadError ?? null);
      return;
    }

    const local = filterProductsByTerm(catalogProducts, searchQuery);
    if (local.length > 0) {
      setRemoteSearchResults(null);
      setSearchError(null);
      return;
    }

    if (searchQuery.trim().length < 2) return;
    if (lastRemoteQuery.current === searchQuery.trim()) return;

    const timer = setTimeout(() => {
      lastRemoteQuery.current = searchQuery.trim();
      const fd = new FormData();
      fd.set("intent", "searchProducts");
      fd.set("query", searchQuery);
      searchFetcher.submit(fd, { method: "post", action: generateAction });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, catalogProducts, productsLoadError, generateAction]);

  useEffect(() => {
    const data = searchFetcher.data as SearchProductsResult | undefined;
    if (!data) return;
    if (data.ok) {
      setRemoteSearchResults(data.results);
      setSearchError(null);
    } else {
      setRemoteSearchResults([]);
      setSearchError(data.error);
    }
  }, [searchFetcher.data]);

  const applyShopifyProductType = useCallback((shopifyType: string) => {
    if (!shopifyType) return;
    const normalized = shopifyType.toLowerCase();
    const match = AI_PRODUCT_TYPES.find(
      (t) => normalized.includes(t.value) || t.label.toLowerCase().includes(normalized),
    );
    if (match && match.value !== "outro") {
      setProductType(match.value);
    }
  }, []);

  const handleSelectProduct = useCallback(
    (product: ProductSearchResult) => {
      setProductId(product.id);
      setSelectedProductTitle(product.title);
      setProductPreview(productPreviewFromSearchRow(product));
      applyShopifyProductType(product.productType);
      setPreview([]);
    },
    [applyShopifyProductType],
  );

  const handleClearProduct = useCallback(() => {
    setProductId("");
    setSelectedProductTitle("");
    setProductPreview(null);
    setPreview([]);
  }, []);

  const handleCountryChange = useCallback((value: string) => {
    setCountry(value);
    setLocale(getDefaultLocaleForCountry(value));
  }, []);

  const localeOptions = useMemo(() => getLocaleSelectOptions(country), [country]);

  const buildFormData = useCallback(
    (intent: "generate" | "save") => {
      const fd = new FormData();
      fd.set("intent", intent);
      fd.set("productType", productType);
      fd.set("customProductType", customProductType);
      fd.set("productId", productId);
      fd.set("gender", gender);
      fd.set("ageRange", ageRange);
      fd.set("tone", tone);
      fd.set("locale", locale);
      fd.set("country", country);
      fd.set("city", city);
      fd.set("ratingMin", String(ratingMin));
      fd.set("ratingMax", String(ratingMax));
      fd.set("count", count);
      fd.set("placement", placement);
      fd.set("verifiedBuyer", String(verifiedBuyer));
      fd.set("saveAsPending", String(saveAsPending));
      fd.set("useProductImages", String(useProductImages));
      fd.set("attachProductImages", String(attachProductImages));
      if (intent === "save") {
        fd.set("reviews", JSON.stringify(preview));
      }
      return fd;
    },
    [
      productType,
      customProductType,
      productId,
      gender,
      ageRange,
      tone,
      locale,
      country,
      city,
      ratingMin,
      ratingMax,
      count,
      placement,
      verifiedBuyer,
      saveAsPending,
      useProductImages,
      attachProductImages,
      preview,
    ],
  );

  const handleGenerate = useCallback(() => {
    generateFetcher.submit(buildFormData("generate"), { method: "post" });
  }, [generateFetcher.submit, buildFormData]);

  const handleSave = useCallback(() => {
    saveSubmit(buildFormData("save"), { method: "post" });
  }, [saveSubmit, buildFormData]);

  const updatePreview = useCallback(
    (index: number, field: keyof GeneratedAiReview, value: string) => {
      setPreview((prev) =>
        prev.map((item, i) => {
          if (i !== index) return item;
          if (field === "rating") {
            return { ...item, rating: clampRating(parseFloat(value) || item.rating) };
          }
          return { ...item, [field]: value };
        }),
      );
    },
    [],
  );

  const isGenerating = generateFetcher.state !== "idle";
  const isSearching = searchFetcher.state !== "idle";

  const generateError =
    generateResult && !generateResult.ok ? generateResult.error : null;
  const saveError =
    actionData && "ok" in actionData && !actionData.ok && !("reviews" in actionData)
      ? actionData.error
      : null;
  const error = generateError || saveError;

  const isHomepage = placement === "homepage";
  const isProductPage = placement === "product";

  const canGenerate =
    aiConfigured && (isHomepage || Boolean(productId));

  const handlePlacementChange = useCallback((value: ReviewPlacement) => {
    setPlacement(value);
    setPreview([]);
  }, []);

  const parsedCount = Math.min(10, Math.max(1, parseInt(count, 10) || 3));

  const summaryBadges = useMemo(
    () => [
      isHomepage ? "Página inicial" : "Página de produto",
      `${count} avaliações`,
      formatRatingRange(ratingMin, ratingMax),
      AI_TONES.find((t) => t.value === tone)?.label || tone,
      labelForOption(AI_LOCALES, locale) || locale,
    ],
    [isHomepage, count, ratingMin, ratingMax, tone, locale],
  );

  const destinationSelector = (
    <PlacementDestinationPicker
      value={placement}
      shopName={shopName}
      productTitle={productPreview?.title}
      onChange={handlePlacementChange}
    />
  );

  const renderProductTab = () => (
    <BlockStack gap="400">
      {productsLoadError && !searchQuery.trim() ? (
        <Banner tone="critical" title="Catálogo indisponível">
          {productsLoadError}
        </Banner>
      ) : null}
      {searchError ? (
        <Banner tone="critical" title="Não foi possível buscar produtos">
          {searchError}
        </Banner>
      ) : null}
      <ProductSearchPicker
        query={searchQuery}
        selectedId={productId}
        selectedLabel={selectedProductTitle}
        results={searchResults}
        loading={isSearching}
        onQueryChange={setSearchQuery}
        listTitle={
          isSearching
            ? "Buscando…"
            : searchResults.length
              ? "Produtos encontrados"
              : searchQuery.trim()
                ? "Nenhum produto para essa busca"
                : "Produtos da loja"
        }
        onSelect={handleSelectProduct}
        onClearSelection={handleClearProduct}
      />
      <Text as="p" variant="bodySm" tone="subdued">
        {isHomepage
          ? "Opcional: use um produto real para a IA citar nome, categoria e fotos. Sem produto, usa só o tipo de produto da aba Estilo."
          : "Obrigatório: escolha o produto que receberá as avaliações."}
      </Text>
      <ProductHeroCard
        product={productPreview}
        onChangeProduct={handleClearProduct}
        emptyHint={
          isHomepage
            ? "Opcional na homepage — sem produto, a IA usa o tipo de produto da aba Estilo."
            : "Selecione o produto que receberá as avaliações."
        }
      />
      <Box padding="400" borderRadius="300" background="bg-surface" borderWidth="025" borderColor="border">
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">
            Análise visual
          </Text>
          <Checkbox
            label="Analisar fotos do produto"
            checked={useProductImages}
            onChange={setUseProductImages}
            disabled={!productId}
            helpText={
              productId
                ? "Até 3 imagens são enviadas para gerar textos com detalhes visuais."
                : "Selecione um produto de referência para usar imagens."
            }
          />
          <Checkbox
            label="Anexar foto do produto em cada avaliação salva"
            checked={attachProductImages}
            onChange={setAttachProductImages}
            disabled={!useProductImages}
          />
        </BlockStack>
      </Box>
    </BlockStack>
  );

  const renderStyleTab = () => (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
        <Select
          label="Tipo de produto"
          options={[...AI_PRODUCT_TYPES]}
          value={productType}
          onChange={setProductType}
        />
        <Select
          label="Tom"
          options={[...AI_TONES]}
          value={tone}
          onChange={setTone}
          helpText={
            tone === "ecommerce"
              ? "Estilo marketplace: entrega, produto, recomendação — como reviews de Amazon, ML ou Trustpilot."
              : undefined
          }
        />
        <Select label="Gênero" options={[...AI_GENDERS]} value={gender} onChange={setGender} />
        <Select
          label="Faixa etária"
          options={[...AI_AGE_RANGES]}
          value={ageRange}
          onChange={setAgeRange}
        />
        <Select
          label="País"
          options={[...AI_COUNTRIES]}
          value={country}
          onChange={handleCountryChange}
        />
        <Select
          label="Idioma"
          options={localeOptions}
          value={locale}
          onChange={setLocale}
          helpText={
            country === "random"
              ? "Todos os idiomas disponíveis"
              : `Ajustado automaticamente para ${country} — você pode trocar`
          }
        />
      </InlineGrid>
      {productType === "outro" ? (
        <TextField
          label="Tipo personalizado"
          value={customProductType}
          onChange={setCustomProductType}
          autoComplete="off"
        />
      ) : null}
      <TextField
        label="Cidade (opcional)"
        value={city}
        onChange={setCity}
        placeholder="Ex.: São Paulo, Lisboa, Miami"
        autoComplete="off"
      />
      <Box padding="400" borderRadius="300" background="bg-surface-secondary" borderWidth="025" borderColor="border">
        <RatingRangeField
          min={ratingMin}
          max={ratingMax}
          count={parsedCount}
          onChange={(min, max) => {
            setRatingMin(min);
            setRatingMax(max);
          }}
        />
      </Box>
    </BlockStack>
  );

  const renderPublishTab = () => (
    <FormLayout>
      <TextField
        label="Quantidade de avaliações"
        type="number"
        value={count}
        onChange={setCount}
        min={1}
        max={10}
        autoComplete="off"
        helpText="Máximo 10 por geração (limite da API gratuita)."
      />
      <Checkbox
        label="Salvar como pendente (revisar antes de publicar)"
        checked={saveAsPending}
        onChange={setSaveAsPending}
      />
      <Checkbox
        label="Marcar como Verified Buyer"
        checked={verifiedBuyer}
        onChange={setVerifiedBuyer}
        helpText="Desmarque para rascunhos gerados por IA."
      />
    </FormLayout>
  );

  return (
    <Page
      title="Gerar avaliações com IA"
      subtitle="Gere avaliações para a homepage ou para a página de um produto"
      backAction={{ url: paths.reviews }}
      primaryAction={{
        content: isGenerating ? "Gerando…" : "Gerar avaliações",
        onAction: handleGenerate,
        disabled: !canGenerate,
        loading: isGenerating,
      }}
      secondaryActions={
        preview.length > 0
          ? [
              {
                content: isHomepage
                  ? `Salvar ${preview.length} na homepage`
                  : `Salvar ${preview.length} no produto`,
                onAction: handleSave,
              },
            ]
          : undefined
      }
    >
      <BlockStack gap="500">
        <InlineStack gap="200" wrap>
          {isHomepage ? (
            <Badge tone="success">Homepage</Badge>
          ) : (
            <Badge tone="info">Produto</Badge>
          )}
          {productPreview ? <Badge>{productPreview.title}</Badge> : null}
          {summaryBadges.map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
        </InlineStack>

        {!aiConfigured ? (
          <Banner tone="warning" title="Geração com IA indisponível">
            <p>
              A chave da API ainda não está configurada no servidor. Peça ao administrador
              para adicionar a variável de ambiente no Railway.
            </p>
          </Banner>
        ) : null}

        {loaderError ? (
          <Banner tone="warning" title="Carregamento parcial">
            <p>{loaderError}</p>
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" title="Erro">
            <p>{error}</p>
          </Banner>
        ) : null}

        {isProductPage && !productId ? (
          <Banner tone="warning" title="Produto obrigatório">
            <p>
              Você escolheu <strong>Página do produto</strong>. Busque e selecione o
              produto na aba Referência antes de gerar.
            </p>
          </Banner>
        ) : null}

        {destinationSelector}

        {generateResult?.ok && generateResult.usedImages && generateResult.productTitle ? (
          <Banner tone="success" title="Imagens analisadas">
            <p>
              Fotos de <strong>{generateResult.productTitle}</strong> usadas como referência visual.
            </p>
          </Banner>
        ) : null}

        {generateResult?.ok && isHomepage ? (
          <Banner tone="info" title="Serão salvas na homepage">
            <p>
              Ao salvar, ficam vinculadas à <strong>página inicial</strong>
              {generateResult.productTitle
                ? ` (texto inspirado em ${generateResult.productTitle}, sem link na página do produto).`
                : ` de ${shopName}.`}
            </p>
          </Banner>
        ) : null}

        {generateResult?.ok && isProductPage && generateResult.productTitle ? (
          <Banner tone="info" title="Serão salvas na página do produto">
            <p>
              Ao salvar, ficam vinculadas à página de <strong>{generateResult.productTitle}</strong>.
            </p>
          </Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, lg: "5fr 7fr" }} gap="500">
          <BlockStack gap="400">
            <Box
              padding="400"
              borderRadius="300"
              background="bg-surface"
              borderWidth="025"
              borderColor="border"
              shadow="100"
            >
              <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
                <Box paddingBlockStart="400">
                  {selectedTab === 0 ? renderProductTab() : null}
                  {selectedTab === 1 ? renderStyleTab() : null}
                  {selectedTab === 2 ? renderPublishTab() : null}
                </Box>
              </Tabs>
              <Divider />
              <Box paddingBlockStart="400">
                <Button
                  variant="primary"
                  fullWidth
                  size="large"
                  onClick={handleGenerate}
                  loading={isGenerating}
                  disabled={!canGenerate}
                >
                  {isGenerating ? "Gerando com IA…" : "Gerar avaliações"}
                </Button>
              </Box>
            </Box>
          </BlockStack>

          <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
            <Box
              padding="400"
              borderRadius="300"
              background="bg-surface"
              borderWidth="025"
              borderColor="border"
              shadow="200"
            >
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Preview
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {preview.length
                        ? `${preview.length} rascunho(s) — edite antes de salvar`
                        : "Os rascunhos aparecem aqui após gerar"}
                    </Text>
                  </BlockStack>
                  {preview.length > 0 ? (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {formatRatingRange(
                        Math.min(...preview.map((r) => r.rating)),
                        Math.max(...preview.map((r) => r.rating)),
                      )}
                    </Text>
                  ) : (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {formatRatingRange(ratingMin, ratingMax)}
                    </Text>
                  )}
                </InlineStack>

                {preview.length === 0 ? (
                  <Box
                    padding="800"
                    borderRadius="300"
                    background="bg-surface-secondary"
                    borderWidth="025"
                    borderColor="border"
                  >
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" variant="headingSm" alignment="center">
                        Nenhum rascunho ainda
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        {isHomepage ? (
                          <>
                            1. Escolha &quot;Página inicial&quot; acima
                            <br />
                            2. (Opcional) produto de referência + estilo
                            <br />
                            3. Clique em Gerar avaliações
                          </>
                        ) : (
                          <>
                            1. Escolha &quot;Página de produto&quot;
                            <br />
                            2. Selecione o produto na aba Referência
                            <br />
                            3. Clique em Gerar avaliações
                          </>
                        )}
                      </Text>
                    </BlockStack>
                  </Box>
                ) : (
                  <BlockStack gap="300">
                    {preview.map((review, index) => (
                      <AiReviewPreviewCard
                        key={`preview-${index}`}
                        review={review}
                        index={index}
                        placement={placement}
                        productTitle={productPreview?.title}
                        onChange={(field, value) => updatePreview(index, field, value)}
                      />
                    ))}
                  </BlockStack>
                )}

                {preview.length > 0 ? (
                  <InlineStack gap="200">
                    <Button variant="primary" onClick={handleSave} fullWidth>
                      {isHomepage
                        ? `Salvar ${preview.length} na página inicial`
                        : `Salvar ${preview.length} na página do produto`}
                    </Button>
                    <Button onClick={handleGenerate} loading={isGenerating} fullWidth>
                      Regenerar
                    </Button>
                  </InlineStack>
                ) : null}
              </BlockStack>
            </Box>
          </div>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
