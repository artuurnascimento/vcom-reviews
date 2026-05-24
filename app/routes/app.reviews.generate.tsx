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
import { StarRatingPicker } from "../components/StarRatingPicker";
import { ReviewStars } from "../components/ReviewStars";

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
  rating: number;
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
  await authenticate.admin(request);
  return {
    geminiConfigured: isGeminiConfigured(),
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
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
    rating: parseFloat(String(form.get("rating") || "5")) || 5,
    count: Math.min(10, Math.max(1, parseInt(String(form.get("count") || "3"), 10) || 3)),
    placement: (String(form.get("placement") || "product") as ReviewPlacement),
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
        rating: payload.rating,
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

  if (!payload.productId) {
    return json({
      ok: false,
      error: "Selecione um produto Shopify para gerar avaliações.",
    } satisfies GenerateResult);
  }

  const product = await getProductDetails(admin, payload.productId);
  if (!product) {
    return json({ ok: false, error: "Produto não encontrado." } satisfies GenerateResult);
  }

  const productDescription = [
    product.description,
    product.productType,
    product.vendor,
    ...(product.tags || []),
  ]
    .filter(Boolean)
    .join(" · ");

  const productImageUrls =
    payload.useProductImages && product.images.length > 0
      ? product.images.map((img) => img.url)
      : [];

  if (payload.useProductImages && productImageUrls.length === 0) {
    return json({
      ok: false,
      error:
        'Este produto não tem imagens. Adicione fotos no Shopify ou desmarque "Analisar imagens".',
    } satisfies GenerateResult);
  }

  try {
    const reviews = await generateReviewsWithGemini({
      productType: payload.productType,
      customProductType: payload.customProductType,
      productTitle: product.title,
      productDescription,
      productImageUrls,
      gender: payload.gender,
      ageRange: payload.ageRange,
      tone: payload.tone,
      locale: payload.locale,
      country: payload.country,
      city: payload.city,
      rating: payload.rating,
      count: payload.count,
    });

    return json({
      ok: true,
      reviews,
      rating: payload.rating,
      placement: payload.placement,
      productId: payload.productId,
      productTitle: product.title,
      usedImages: productImageUrls.length > 0,
    } satisfies GenerateResult);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao gerar avaliações.";
    return json({ ok: false, error: msg } satisfies GenerateResult);
  }
};

const TABS = [
  { id: "product", content: "Produto" },
  { id: "style", content: "Estilo" },
  { id: "publish", content: "Publicação" },
];

export default function GenerateReviewsPage() {
  const { geminiConfigured, geminiModel } = useLoaderData<typeof loader>();
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
  const [rating, setRating] = useState(5);
  const [count, setCount] = useState("3");
  const [placement, setPlacement] = useState<ReviewPlacement>("product");
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
      fd.set("rating", String(rating));
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
      rating,
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
        prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
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

  const canGenerate = geminiConfigured && Boolean(productId);

  const summaryBadges = useMemo(
    () => [
      `${count} avaliações`,
      `${rating}★`,
      AI_TONES.find((t) => t.value === tone)?.label || tone,
      AI_LOCALES.find((l) => l.value === locale)?.label || locale,
    ],
    [count, rating, tone, locale],
  );

  const productTab = (
    <BlockStack gap="400">
      <ProductSearchPicker
        selectedId={productId}
        selectedTitle={selectedProductTitle}
        results={searchResults}
        loading={isSearching}
        onQueryChange={setSearchQuery}
        onSelect={handleSelectProduct}
        onClear={handleClearProduct}
      />
      <ProductHeroCard
        product={productPreview}
        loading={isLoadingProduct}
        onChangeProduct={handleClearProduct}
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
            helpText="Até 3 imagens são enviadas para gerar textos com detalhes visuais."
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
        <Select label="Idioma" options={[...AI_LOCALES]} value={locale} onChange={setLocale} />
        <Select label="País" options={[...AI_COUNTRIES]} value={country} onChange={setCountry} />
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
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            Nota das avaliações
          </Text>
          <StarRatingPicker value={rating} onChange={setRating} />
        </BlockStack>
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
      <Select
        label="Onde exibir"
        options={[
          { label: "Página de produto", value: "product" },
          { label: "Página inicial", value: "homepage" },
        ]}
        value={placement}
        onChange={(v) => setPlacement(v as ReviewPlacement)}
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
      subtitle="Busque um produto, personalize o estilo e gere rascunhos prontos para revisar"
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
          {productPreview ? <Badge tone="info">{productPreview.title}</Badge> : null}
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

        {generateResult?.ok && generateResult.usedImages ? (
          <Banner tone="success" title="Imagens analisadas">
            <p>
              Fotos de <strong>{generateResult.productTitle}</strong> usadas para enriquecer os
              textos.
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
                    <InlineStack gap="200" blockAlign="center">
                      <ReviewStars rating={rating} size={16} />
                      <Text as="span" variant="bodySm" tone="subdued">
                        {rating}/5
                      </Text>
                    </InlineStack>
                  ) : null}
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
                        1. Busque e selecione um produto
                        <br />
                        2. Ajuste tom, persona e quantidade
                        <br />
                        3. Clique em Gerar avaliações
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
                        rating={rating}
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
