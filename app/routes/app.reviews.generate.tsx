import {
  isRouteErrorResponse,
  useActionData,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "@remix-run/react";
import { useEmbeddedFetcher } from "../hooks/useEmbeddedAppPath";
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
  Pagination,
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
  MAX_REVIEWS_PER_GEMINI_CALL,
  MAX_REVIEWS_TOTAL,
  type GeneratedAiReview,
  formatRatingRange,
  clampRating,
  getDefaultLocaleForCountry,
  getLocaleSelectOptions,
  labelForOption,
} from "../lib/ai-review-options";
import {
  getCityModeLabel,
  type AiCityMode,
} from "../lib/ai-country-cities";
import type { ReviewPlacement } from "../lib/constants";
import {
  GENERATE_HTTP_CHUNK_SIZE,
  GENERATE_HTTP_CHUNK_THRESHOLD,
  SAVE_HTTP_CHUNK_SIZE,
  isGenerateSuccess,
  postGenerateReviews,
  postSaveReviews,
  productPreviewFromSearchRow,
  type GenerateLoaderData,
  type GenerateSuccess,
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
import { useAppPaths, useEmbeddedAppPath } from "../hooks/useEmbeddedAppPath";

export { loader, action } from "../lib/reviews-generate-route.server";

const TABS = [
  { id: "product", content: "Referência" },
  { id: "style", content: "Estilo" },
  { id: "publish", content: "Quantidade" },
];

const PREVIEW_PAGE_SIZE = 10;

function getRouteErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (error.status === 502 || error.status === 504) {
      return (
        "O servidor demorou demais (timeout). Para 100+ avaliações o app divide em lotes — " +
        "atualize a página (Cmd+Shift+R) e gere de novo."
      );
    }
    if (typeof error.data === "string" && error.data) {
      try {
        const parsed = JSON.parse(error.data) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        /* plain text */
      }
      return error.data;
    }
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
  const embedPath = useEmbeddedAppPath();
  const navigate = useNavigate();
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
  const [cityMode, setCityMode] = useState<AiCityMode>("random");
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
  const [generateProgress, setGenerateProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [clientGenerateError, setClientGenerateError] = useState<string | null>(null);
  const [clientSaveError, setClientSaveError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [saveSkippedTotal, setSaveSkippedTotal] = useState(0);
  const [lastGenerateMeta, setLastGenerateMeta] = useState<GenerateSuccess | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const bulkGenerateAbort = useRef<AbortController | null>(null);

  const generateResult = isGenerateSuccess(generateFetcher.data)
    ? generateFetcher.data
    : isGenerateSuccess(actionData)
      ? actionData
      : null;

  useEffect(() => {
    if (isGenerateSuccess(generateFetcher.data)) {
      setPreview(generateFetcher.data.reviews);
      setLastGenerateMeta(generateFetcher.data);
      setClientGenerateError(null);
      setPreviewPage(1);
    }
  }, [generateFetcher.data]);

  useEffect(() => {
    setPreviewPage(1);
  }, [preview.length]);

  const previewPageCount = Math.max(1, Math.ceil(preview.length / PREVIEW_PAGE_SIZE));
  const safePreviewPage = Math.min(previewPage, previewPageCount);

  const paginatedPreview = useMemo(() => {
    const start = (safePreviewPage - 1) * PREVIEW_PAGE_SIZE;
    return preview
      .slice(start, start + PREVIEW_PAGE_SIZE)
      .map((review, offset) => ({ review, index: start + offset }));
  }, [preview, safePreviewPage]);

  const catalogProducts = useMemo(() => initialProducts ?? [], [initialProducts]);

  const searchResults = useMemo(() => {
    const term = searchQuery.trim();
    if (!term) return catalogProducts;
    // Junta o resultado do servidor (catálogo inteiro) com o filtro local, sem
    // duplicar. O filtro local sozinho só enxerga a 1ª página do catálogo.
    const remote = remoteSearchResults ?? [];
    const merged = [...remote];
    const seen = new Set(remote.map((p) => p.id));
    for (const product of filterProductsByTerm(catalogProducts, term)) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
    }
    return merged;
  }, [searchQuery, catalogProducts, remoteSearchResults]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setRemoteSearchResults(null);
      lastRemoteQuery.current = "";
      setSearchError(productsLoadError ?? null);
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

  const cityModeOptions = useMemo(
    () => [
      {
        label: getCityModeLabel(country, "random"),
        value: "random",
      },
      { label: getCityModeLabel(country, "fixed"), value: "fixed" },
      { label: getCityModeLabel(country, "none"), value: "none" },
    ],
    [country],
  );

  const buildFormData = useCallback(
    (intent: "generate" | "save", generateCountOverride?: number) => {
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
      fd.set("cityMode", cityMode);
      fd.set("city", cityMode === "fixed" ? city : "");
      fd.set("ratingMin", String(ratingMin));
      fd.set("ratingMax", String(ratingMax));
      fd.set("count", String(generateCountOverride ?? count));
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
      cityMode,
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

  const runBulkGenerate = useCallback(
    async (total: number) => {
      bulkGenerateAbort.current?.abort();
      const controller = new AbortController();
      bulkGenerateAbort.current = controller;

      setClientGenerateError(null);
      setPreview([]);
      setGenerateProgress({ done: 0, total });

      const accumulated: GeneratedAiReview[] = [];
      let lastOk: GenerateSuccess | null = null;

      try {
        let remaining = total;
        while (remaining > 0) {
          if (controller.signal.aborted) return;

          const chunkCount = Math.min(GENERATE_HTTP_CHUNK_SIZE, remaining);
          const fd = buildFormData("generate", chunkCount);
          const result = await postGenerateReviews(
            generateAction,
            fd,
            controller.signal,
          );

          if (!result.ok) {
            const partial =
              accumulated.length > 0
                ? ` (${accumulated.length} de ${total} já geradas — você pode salvar o parcial.)`
                : "";
            throw new Error(`${result.error}${partial}`);
          }

          accumulated.push(...result.reviews);
          lastOk = result;
          remaining -= chunkCount;
          setPreview([...accumulated]);
          setGenerateProgress({ done: accumulated.length, total });
        }

        if (lastOk) setLastGenerateMeta(lastOk);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg = err instanceof Error ? err.message : "Erro ao gerar avaliações.";
        setClientGenerateError(msg);
      } finally {
        setGenerateProgress(null);
        bulkGenerateAbort.current = null;
      }
    },
    [buildFormData, generateAction],
  );

  const handleGenerate = useCallback(() => {
    const total = Math.min(
      MAX_REVIEWS_TOTAL,
      Math.max(1, parseInt(count, 10) || 3),
    );

    if (total > GENERATE_HTTP_CHUNK_THRESHOLD) {
      void runBulkGenerate(total);
      return;
    }

    setClientGenerateError(null);
    generateFetcher.submit(buildFormData("generate"), { method: "post" });
  }, [count, generateFetcher.submit, buildFormData, runBulkGenerate]);

  const buildSaveChunkFormData = useCallback(
    (chunk: GeneratedAiReview[], knownFileIds: Record<string, string>) => {
      const fd = buildFormData("save");
      fd.set("intent", "saveBatch");
      fd.set("reviews", JSON.stringify(chunk));
      fd.set("knownFileIds", JSON.stringify(knownFileIds));
      return fd;
    },
    [buildFormData],
  );

  const runBulkSave = useCallback(async () => {
    if (preview.length === 0) return;

    setClientSaveError(null);
    setSaveSkippedTotal(0);
    setSaveProgress({ done: 0, total: preview.length });

    let knownFileIds: Record<string, string> = {};
    let savedTotal = 0;
    let skippedTotal = 0;

    try {
      for (let offset = 0; offset < preview.length; offset += SAVE_HTTP_CHUNK_SIZE) {
        const chunk = preview.slice(offset, offset + SAVE_HTTP_CHUNK_SIZE);
        const result = await postSaveReviews(
          generateAction,
          buildSaveChunkFormData(chunk, knownFileIds),
        );

        if (!result.ok) {
          const partial =
            savedTotal > 0 || skippedTotal > 0
              ? ` (${savedTotal} salvas, ${skippedTotal} duplicadas ignoradas — confira em Avaliações.)`
              : "";
          throw new Error(`${result.error}${partial}`);
        }

        knownFileIds = result.urlToFileId;
        savedTotal += result.saved;
        skippedTotal += result.skipped;
        setSaveSkippedTotal(skippedTotal);
        setSaveProgress({
          done: Math.min(savedTotal + skippedTotal, preview.length),
          total: preview.length,
        });
      }

      const destination = saveAsPending
        ? embedPath("/app/reviews/pending")
        : embedPath("/app/reviews");
      navigate(destination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar avaliações.";
      setClientSaveError(msg);
    } finally {
      setSaveProgress(null);
    }
  }, [
    preview,
    generateAction,
    buildSaveChunkFormData,
    saveAsPending,
    embedPath,
    navigate,
  ]);

  const handleSave = useCallback(() => {
    void runBulkSave();
  }, [runBulkSave]);

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

  const isBulkGenerating = generateProgress !== null;
  const isSaving = saveProgress !== null;
  const isGenerating = generateFetcher.state !== "idle" || isBulkGenerating;
  const isSearching = searchFetcher.state !== "idle";

  const generateError =
    generateResult && !generateResult.ok && "error" in generateResult
      ? generateResult.error
      : null;
  const saveError =
    actionData && "ok" in actionData && !actionData.ok && !("reviews" in actionData)
      ? actionData.error
      : null;
  const error = clientSaveError || clientGenerateError || generateError || saveError;
  const errorMessage =
    typeof error === "string"
      ? error
      : error
        ? JSON.stringify(error)
        : null;

  const generateMeta = lastGenerateMeta ?? (generateResult?.ok ? generateResult : null);

  const isHomepage = placement === "homepage";
  const isProductPage = placement === "product";

  const canGenerate =
    aiConfigured && (isHomepage || Boolean(productId));

  const handlePlacementChange = useCallback((value: ReviewPlacement) => {
    setPlacement(value);
    setPreview([]);
  }, []);

  const parsedCount = Math.min(
    MAX_REVIEWS_TOTAL,
    Math.max(1, parseInt(count, 10) || 3),
  );

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
      <Select
        label="Cidade"
        options={cityModeOptions}
        value={cityMode}
        onChange={(value) => setCityMode(value as AiCityMode)}
        helpText={
          cityMode === "random"
            ? country === "random"
              ? "Cada avaliação pode usar uma cidade de um país diferente."
              : `Sorteia cidades reais de ${country} (ex.: Paris, Lyon…).`
            : cityMode === "fixed"
              ? "Todas as avaliações usam a mesma cidade."
              : "A IA não precisa citar cidade no texto."
        }
      />
      {cityMode === "fixed" ? (
        <TextField
          label="Nome da cidade"
          value={city}
          onChange={setCity}
          placeholder={
            country === "random"
              ? "Ex.: São Paulo, Paris, Miami"
              : `Ex.: cidade em ${country}`
          }
          autoComplete="off"
        />
      ) : null}
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
        max={MAX_REVIEWS_TOTAL}
        autoComplete="off"
        helpText={`Até ${MAX_REVIEWS_TOTAL}. Acima de ${GENERATE_HTTP_CHUNK_THRESHOLD}, o app envia ${GENERATE_HTTP_CHUNK_SIZE} por vez (evita erro 502). Desmarque “Analisar imagens” para ir mais rápido.`}
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
        content: isGenerating
          ? generateProgress
            ? `Gerando ${generateProgress.done}/${generateProgress.total}…`
            : parsedCount > GENERATE_HTTP_CHUNK_THRESHOLD
              ? `Gerando ${parsedCount}…`
              : "Gerando…"
          : "Gerar avaliações",
        onAction: handleGenerate,
        disabled: !canGenerate,
        loading: isGenerating,
      }}
      secondaryActions={
        preview.length > 0
          ? [
              {
                content: isSaving
                  ? `Salvando ${saveProgress?.done ?? 0}/${saveProgress?.total ?? preview.length}…`
                  : isHomepage
                    ? `Salvar ${preview.length} na homepage`
                    : `Salvar ${preview.length} no produto`,
                onAction: handleSave,
                disabled: isSaving || isGenerating,
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

        {parsedCount > GENERATE_HTTP_CHUNK_THRESHOLD && !isGenerating ? (
          <Banner tone="info" title="Geração em volume">
            <p>
              {parsedCount} avaliações = {Math.ceil(parsedCount / GENERATE_HTTP_CHUNK_SIZE)}{" "}
              etapas de {GENERATE_HTTP_CHUNK_SIZE} (evita timeout). Não feche a aba — o progresso
              aparece no botão. Use <strong>gemini-2.5-flash-lite</strong> no Railway e desative
              &quot;Analisar fotos&quot; para acelerar.
            </p>
          </Banner>
        ) : null}

        {isBulkGenerating && generateProgress ? (
          <Banner tone="info" title="Gerando em etapas">
            <p>
              {generateProgress.done} de {generateProgress.total} prontas… Aguarde até concluir
              todas as etapas antes de salvar.
            </p>
          </Banner>
        ) : null}

        {isSaving && saveProgress ? (
          <Banner tone="info" title="Salvando avaliações">
            <p>
              Processando {saveProgress.done} de {saveProgress.total}…
              {saveSkippedTotal > 0
                ? ` (${saveSkippedTotal} duplicadas ignoradas)`
                : ""}{" "}
              Não feche esta aba até redirecionar para a lista de avaliações.
            </p>
          </Banner>
        ) : null}

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

        {errorMessage ? (
          <Banner tone="critical" title="Erro">
            <p>{errorMessage}</p>
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

        {generateMeta && generateMeta.usedImages && generateMeta.productTitle ? (
          <Banner tone="success" title="Imagens analisadas">
            <p>
              Fotos de <strong>{generateMeta.productTitle}</strong> usadas como referência visual.
            </p>
          </Banner>
        ) : null}

        {generateMeta && isHomepage ? (
          <Banner tone="info" title="Serão salvas na homepage">
            <p>
              Ao salvar, ficam vinculadas à <strong>página inicial</strong>
              {generateMeta.productTitle
                ? ` (texto inspirado em ${generateMeta.productTitle}, sem link na página do produto).`
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
                        ? preview.length > PREVIEW_PAGE_SIZE
                          ? `${preview.length} rascunhos — página ${safePreviewPage} de ${previewPageCount} (${PREVIEW_PAGE_SIZE} por página)`
                          : `${preview.length} rascunho(s) — edite antes de salvar`
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
                    {paginatedPreview.map(({ review, index }) => (
                      <AiReviewPreviewCard
                        key={`preview-${index}`}
                        review={review}
                        index={index}
                        placement={placement}
                        productTitle={productPreview?.title}
                        onChange={(field, value) => updatePreview(index, field, value)}
                      />
                    ))}
                    {preview.length > PREVIEW_PAGE_SIZE ? (
                      <Box paddingBlockStart="200">
                        <InlineStack align="center">
                          <Pagination
                            hasPrevious={safePreviewPage > 1}
                            onPrevious={() =>
                              setPreviewPage((page) => Math.max(1, page - 1))
                            }
                            hasNext={safePreviewPage < previewPageCount}
                            onNext={() =>
                              setPreviewPage((page) =>
                                Math.min(previewPageCount, page + 1),
                              )
                            }
                            label={`${(safePreviewPage - 1) * PREVIEW_PAGE_SIZE + 1}–${Math.min(safePreviewPage * PREVIEW_PAGE_SIZE, preview.length)} de ${preview.length}`}
                          />
                        </InlineStack>
                      </Box>
                    ) : null}
                  </BlockStack>
                )}

                {preview.length > 0 ? (
                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      loading={isSaving}
                      disabled={isSaving || isGenerating}
                      fullWidth
                    >
                      {isSaving && saveProgress
                        ? `Salvando ${saveProgress.done}/${saveProgress.total}…`
                        : isHomepage
                          ? `Salvar ${preview.length} na página inicial`
                          : `Salvar ${preview.length} na página do produto`}
                    </Button>
                    <Button
                      onClick={handleGenerate}
                      loading={isGenerating}
                      disabled={isSaving || isGenerating}
                      fullWidth
                    >
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
