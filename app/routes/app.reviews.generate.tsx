import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useFetcher, useLoaderData, useSubmit } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
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
import { authenticate } from "../shopify.server";
import {
  AI_AGE_RANGES,
  AI_COUNTRIES,
  AI_GENDERS,
  AI_LOCALES,
  AI_PRODUCT_TYPES,
  AI_TONES,
  type GeneratedAiReview,
  formatRatingRange,
  normalizeRatingRange,
  clampRating,
  getDefaultLocaleForCountry,
  getLocaleSelectOptions,
  labelForOption,
} from "../lib/ai-review-options";
import {
  generateReviewsWithGemini,
  isGeminiConfigured,
} from "../lib/ai-reviews.server";
import type { ReviewPlacement } from "../lib/constants";
import { createReview, getProductDetails, searchProducts } from "../lib/reviews.server";
import { createShopifyFilesFromUrls } from "../lib/upload.server";
import { AiReviewPreviewCard } from "../components/AiReviewPreviewCard";
import {
  ProductSearchPicker,
  type ProductSearchResult,
} from "../components/ProductSearchPicker";
import { ProductHeroCard } from "../components/ProductHeroCard";
import { RatingRangeField } from "../components/RatingRangeField";

type ProductPreview = {
  id: string;
  title: string;
  description: string;
  productType: string;
  vendor: string;
  tags: string[];
  images: Array<{ url: string; altText: string }>;
};

type GenerateSuccess = {
  ok: true;
  reviews: GeneratedAiReview[];
  ratingMin: number;
  ratingMax: number;
  placement: ReviewPlacement;
  productId: string;
  productTitle?: string;
  usedImages: boolean;
};

type GenerateError = { ok: false; error: string };
type GenerateResult = GenerateSuccess | GenerateError;

type ProductLoadResult =
  | { ok: true; product: ProductPreview | null }
  | { ok: false; error: string };

type SearchProductsResult =
  | { ok: true; results: ProductSearchResult[] }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const shopRes = await admin.graphql(`#graphql query { shop { name } }`);
  const shopJson = await shopRes.json();
  return {
    geminiConfigured: isGeminiConfigured(),
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    shopName: (shopJson.data?.shop?.name as string) || "Sua loja",
  };
};

function parseGenerateInput(form: FormData) {
  return {
    productType: String(form.get("productType") || "moda"),
    customProductType: String(form.get("customProductType") || "").trim(),
    productId: String(form.get("productId") || "").trim(),
    gender: String(form.get("gender") || "random"),
    ageRange: String(form.get("ageRange") || "random"),
    tone: String(form.get("tone") || "natural"),
    locale: String(form.get("locale") || "pt-BR"),
    country: String(form.get("country") || "random"),
    city: String(form.get("city") || "").trim(),
    ratingMin: parseFloat(String(form.get("ratingMin") || "4.6")) || 4.6,
    ratingMax: parseFloat(String(form.get("ratingMax") || "5")) || 5,
    count: Math.min(10, Math.max(1, parseInt(String(form.get("count") || "3"), 10) || 3)),
    placement: (String(form.get("placement") || "homepage") as ReviewPlacement),
    verifiedBuyer: form.get("verifiedBuyer") === "true",
    saveAsPending: form.get("saveAsPending") !== "false",
    useProductImages: form.get("useProductImages") !== "false",
    attachProductImages: form.get("attachProductImages") !== "false",
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "generate");

  if (intent === "searchProducts") {
    const query = String(form.get("query") || "");
    try {
      const results = await searchProducts(admin, query, { first: 15 });
      return json({ ok: true, results } satisfies SearchProductsResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar produtos.";
      return json({ ok: false, error: msg } satisfies SearchProductsResult);
    }
  }

  if (intent === "loadProduct") {
    const productId = String(form.get("productId") || "").trim();
    if (!productId) {
      return json({ ok: true, product: null } satisfies ProductLoadResult);
    }
    const product = await getProductDetails(admin, productId);
    return json({ ok: true, product } satisfies ProductLoadResult);
  }

  if (intent === "save") {
    const payload = parseGenerateInput(form);
    const reviewsJson = String(form.get("reviews") || "[]");
    let reviews: GeneratedAiReview[] = [];
    try {
      reviews = JSON.parse(reviewsJson) as GeneratedAiReview[];
    } catch {
      return json({ ok: false, error: "Dados de preview inválidos." } satisfies GenerateResult);
    }

    if (reviews.length === 0) {
      return json({ ok: false, error: "Nenhuma avaliação para salvar." } satisfies GenerateResult);
    }

    if (payload.placement === "product" && !payload.productId) {
      return json({
        ok: false,
        error: "Selecione um produto para avaliações de produto.",
      } satisfies GenerateResult);
    }

    const status = payload.saveAsPending ? "pending" : "approved";

    let urlToFileId: Record<string, string> = {};
    if (payload.attachProductImages) {
      const urls = reviews.map((r) => r.imageUrl).filter(Boolean) as string[];
      if (urls.length > 0) {
        try {
          urlToFileId = await createShopifyFilesFromUrls(admin, urls);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro ao anexar imagens do produto.";
          return json({ ok: false, error: msg } satisfies GenerateResult);
        }
      }
    }

    for (const review of reviews) {
      const imageFileIds =
        payload.attachProductImages && review.imageUrl
          ? [urlToFileId[review.imageUrl]].filter(Boolean)
          : [];

      await createReview(admin, {
        rating: clampRating(review.rating ?? payload.ratingMax),
        verified_buyer: payload.verifiedBuyer,
        title: review.title,
        body: review.body,
        author: review.author,
        time: review.time,
        placement: payload.placement,
        productId: payload.placement === "product" ? payload.productId : undefined,
        imageFileIds,
        status,
      });
    }

    return redirect(`/app/reviews${status === "pending" ? "/pending" : ""}`);
  }

  if (!isGeminiConfigured()) {
    return json({
      ok: false,
      error: "Configure GEMINI_API_KEY no Railway ou .env para usar a geração com IA.",
    } satisfies GenerateResult);
  }

  const payload = parseGenerateInput(form);

  if (payload.placement === "product" && !payload.productId) {
    return json({
      ok: false,
      error: "Selecione um produto para gerar avaliações da página de produto.",
    } satisfies GenerateResult);
  }

  let product: Awaited<ReturnType<typeof getProductDetails>> = null;
  if (payload.productId) {
    product = await getProductDetails(admin, payload.productId);
    if (!product) {
      return json({ ok: false, error: "Produto não encontrado." } satisfies GenerateResult);
    }
  }

  const productDescription = product
    ? [product.description, product.productType, product.vendor, ...(product.tags || [])]
        .filter(Boolean)
        .join(" · ")
    : "";

  const productImageUrls =
    product && payload.useProductImages && product.images.length > 0
      ? product.images.map((img) => img.url)
      : [];

  if (payload.useProductImages && payload.productId && productImageUrls.length === 0) {
    return json({
      ok: false,
      error:
        'Este produto não tem imagens. Adicione fotos no Shopify ou desmarque "Analisar imagens".',
    } satisfies GenerateResult);
  }

  if (payload.useProductImages && !payload.productId) {
    return json({
      ok: false,
      error: "Para analisar imagens, selecione um produto de referência na aba Produto.",
    } satisfies GenerateResult);
  }

  const shopRes = await admin.graphql(`#graphql query { shop { name } }`);
  const shopJson = await shopRes.json();
  const shopName = (shopJson.data?.shop?.name as string) || "Sua loja";

  const { min: ratingMin, max: ratingMax } = normalizeRatingRange(
    payload.ratingMin,
    payload.ratingMax,
  );

  try {
    const reviews = await generateReviewsWithGemini({
      productType: payload.productType,
      customProductType: payload.customProductType,
      productTitle: product?.title,
      productDescription,
      productImageUrls,
      placement: payload.placement,
      shopName,
      gender: payload.gender,
      ageRange: payload.ageRange,
      tone: payload.tone,
      locale: payload.locale,
      country: payload.country,
      city: payload.city,
      ratingMin,
      ratingMax,
      count: payload.count,
    });

    return json({
      ok: true,
      reviews,
      ratingMin,
      ratingMax,
      placement: payload.placement,
      productId: payload.productId,
      productTitle: product?.title,
      usedImages: productImageUrls.length > 0,
    } satisfies GenerateResult);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar avaliações.";
    return json({ ok: false, error: msg } satisfies GenerateResult);
  }
};

const TABS = [
  { id: "product", content: "Referência" },
  { id: "style", content: "Estilo" },
  { id: "publish", content: "Quantidade" },
];

export default function GenerateReviewsPage() {
  const { geminiConfigured, geminiModel, shopName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const generateFetcher = useFetcher<typeof action>();
  const productFetcher = useFetcher<typeof action>();
  const searchFetcher = useFetcher<typeof action>();
  const saveSubmit = useSubmit();

  const [selectedTab, setSelectedTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [selectedProductTitle, setSelectedProductTitle] = useState("");

  const [productType, setProductType] = useState("moda");
  const [customProductType, setCustomProductType] = useState("");
  const [productId, setProductId] = useState("");
  const [gender, setGender] = useState("random");
  const [ageRange, setAgeRange] = useState("random");
  const [tone, setTone] = useState("natural");
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

  const generateResult =
    generateFetcher.data && "ok" in generateFetcher.data && "reviews" in generateFetcher.data
      ? (generateFetcher.data as GenerateResult)
      : actionData && "ok" in actionData && "reviews" in actionData
        ? (actionData as GenerateResult)
        : null;

  useEffect(() => {
    if (generateResult?.ok) {
      setPreview(generateResult.reviews);
    }
  }, [generateResult]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const fd = new FormData();
      fd.set("intent", "searchProducts");
      fd.set("query", searchQuery);
      searchFetcher.submit(fd, { method: "post" });
    }, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    const data = searchFetcher.data as SearchProductsResult | undefined;
    if (data?.ok) {
      setSearchResults(data.results);
    }
  }, [searchFetcher.data]);

  useEffect(() => {
    if (!productId) {
      setProductPreview(null);
      return;
    }
    const fd = new FormData();
    fd.set("intent", "loadProduct");
    fd.set("productId", productId);
    productFetcher.submit(fd, { method: "post" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    const data = productFetcher.data as ProductLoadResult | undefined;
    if (data?.ok && data.product) {
      setProductPreview(data.product);
      setSelectedProductTitle(data.product.title);
      if (data.product.productType) {
        const shopifyType = data.product.productType.toLowerCase();
        const match = AI_PRODUCT_TYPES.find(
          (t) => shopifyType.includes(t.value) || t.label.toLowerCase().includes(shopifyType),
        );
        if (match && match.value !== "outro") {
          setProductType(match.value);
        }
      }
    } else if (data?.ok && !data.product) {
      setProductPreview(null);
    }
  }, [productFetcher.data]);

  const handleSelectProduct = useCallback((product: ProductSearchResult) => {
    setProductId(product.id);
    setSelectedProductTitle(product.title);
    setPreview([]);
  }, []);

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
  }, [generateFetcher, buildFormData]);

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
  const isLoadingProduct = productFetcher.state !== "idle" && Boolean(productId);
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
    geminiConfigured && (isHomepage || Boolean(productId));

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
    <Box padding="400" borderRadius="300" background="bg-surface-secondary" borderWidth="025" borderColor="border">
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          Onde as avaliações vão aparecer
        </Text>
        <ButtonGroup variant="segmented" fullWidth>
          <Button
            pressed={isHomepage}
            onClick={() => handlePlacementChange("homepage")}
          >
            Página inicial
          </Button>
          <Button
            pressed={isProductPage}
            onClick={() => handlePlacementChange("product")}
          >
            Página de produto
          </Button>
        </ButtonGroup>
        <Text as="p" variant="bodySm" tone="subdued">
          {isHomepage
            ? `Textos para o carrossel da homepage de ${shopName}. O produto abaixo é opcional — só inspira a IA.`
            : "Textos para a ficha do produto. Selecione o produto na aba Referência."}
        </Text>
      </BlockStack>
    </Box>
  );

  const productTab = (
    <BlockStack gap="400">
      {destinationSelector}
      <ProductSearchPicker
        selectedId={productId}
        selectedTitle={selectedProductTitle}
        results={searchResults}
        loading={isSearching}
        onQueryChange={setSearchQuery}
        onSelect={handleSelectProduct}
        onClear={handleClearProduct}
      />
      <Text as="p" variant="bodySm" tone="subdued">
        {isHomepage
          ? "Opcional: use um produto real para a IA citar nome, categoria e fotos. Sem produto, usa só o tipo de produto da aba Estilo."
          : "Obrigatório: escolha o produto que receberá as avaliações."}
      </Text>
      <ProductHeroCard
        product={productPreview}
        loading={isLoadingProduct}
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
            Análise visual com IA
          </Text>
          <Checkbox
            label="Analisar fotos do produto (Gemini Vision)"
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

  const styleTab = (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
        <Select
          label="Tipo de produto"
          options={[...AI_PRODUCT_TYPES]}
          value={productType}
          onChange={setProductType}
        />
        <Select label="Tom" options={[...AI_TONES]} value={tone} onChange={setTone} />
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

  const publishTab = (
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
      backAction={{ url: "/app/reviews" }}
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
                content: `Salvar ${preview.length}`,
                onAction: handleSave,
              },
            ]
          : undefined
      }
    >
      <BlockStack gap="500">
        <InlineStack gap="200" wrap>
          <Badge tone={geminiConfigured ? "success" : "warning"}>
            {geminiConfigured ? `Gemini · ${geminiModel}` : "API key pendente"}
          </Badge>
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

        {!geminiConfigured ? (
          <Banner tone="warning" title="Configure a API key">
            <p>
              Adicione <strong>GEMINI_API_KEY</strong> no Railway. Chave gratuita em{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              .
            </p>
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" title="Erro">
            <p>{error}</p>
          </Banner>
        ) : null}

        {generateResult?.ok && generateResult.usedImages && generateResult.productTitle ? (
          <Banner tone="success" title="Imagens analisadas">
            <p>
              Fotos de <strong>{generateResult.productTitle}</strong> usadas como referência visual.
            </p>
          </Banner>
        ) : null}

        {generateResult?.ok && isHomepage ? (
          <Banner tone="info" title="Avaliações para a homepage">
            <p>
              Ao salvar, as avaliações vão para a <strong>página inicial</strong>
              {generateResult.productTitle
                ? ` (inspiradas em ${generateResult.productTitle}, sem vínculo à página do produto).`
                : ` de ${shopName}.`}
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
                  {selectedTab === 0 ? productTab : null}
                  {selectedTab === 1 ? styleTab : null}
                  {selectedTab === 2 ? publishTab : null}
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
                        onChange={(field, value) => updatePreview(index, field, value)}
                      />
                    ))}
                  </BlockStack>
                )}

                {preview.length > 0 ? (
                  <InlineStack gap="200">
                    <Button variant="primary" onClick={handleSave} fullWidth>
                      {`Salvar ${preview.length} avaliação(ões)`}
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
