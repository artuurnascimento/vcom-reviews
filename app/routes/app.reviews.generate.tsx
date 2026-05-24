import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useFetcher, useLoaderData, useSubmit } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const products = (await searchProducts(admin, "")) as Array<{
    id: string;
    title: string;
    handle: string;
  }>;
  return {
    products,
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

async function resolveProductContext(
  admin: Parameters<typeof getProductDetails>[0],
  productId: string,
) {
  if (!productId) return null;
  return getProductDetails(admin, productId);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "generate");

  if (intent === "loadProduct") {
    const productId = String(form.get("productId") || "").trim();
    if (!productId) {
      return json({ ok: true, product: null } satisfies ProductLoadResult);
    }
    const product = await resolveProductContext(admin, productId);
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
      error: "Selecione um produto Shopify para gerar avaliações com base nas informações e imagens.",
    } satisfies GenerateResult);
  }

  const product = await resolveProductContext(admin, payload.productId);
  if (!product) {
    return json({ ok: false, error: "Produto não encontrado." } satisfies GenerateResult);
  }

  const productTitle = product.title;
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
      error: "Este produto não tem imagens. Adicione fotos no Shopify ou desmarque \"Usar imagens do produto\".",
    } satisfies GenerateResult);
  }

  try {
    const reviews = await generateReviewsWithGemini({
      productType: payload.productType,
      customProductType: payload.customProductType,
      productTitle,
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

export default function GenerateReviewsPage() {
  const { products, geminiConfigured, geminiModel } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const generateFetcher = useFetcher<typeof action>();
  const productFetcher = useFetcher<typeof action>();
  const saveSubmit = useSubmit();

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
    if (data?.ok) {
      setProductPreview(data.product);
      if (data.product?.productType) {
        const shopifyType = data.product.productType.toLowerCase();
        const match = AI_PRODUCT_TYPES.find(
          (t) => shopifyType.includes(t.value) || t.label.toLowerCase().includes(shopifyType),
        );
        if (match && match.value !== "outro") {
          setProductType(match.value);
        }
      }
    }
  }, [productFetcher.data]);

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

  const updatePreview = useCallback((index: number, field: keyof GeneratedAiReview, value: string) => {
    setPreview((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }, []);

  const isGenerating = generateFetcher.state !== "idle";
  const isLoadingProduct = productFetcher.state !== "idle";
  const generateError =
    generateResult && !generateResult.ok ? generateResult.error : null;
  const saveError =
    actionData && "ok" in actionData && !actionData.ok && !("reviews" in actionData)
      ? actionData.error
      : null;
  const error = generateError || saveError;

  return (
    <Page
      title="Gerar avaliações com IA"
      subtitle={`Gemini Flash (${geminiModel}) — usa título, descrição e fotos do produto`}
      backAction={{ url: "/app/reviews" }}
    >
      <BlockStack gap="500">
        {!geminiConfigured ? (
          <Banner tone="warning" title="API key necessária">
            <p>
              Adicione <strong>GEMINI_API_KEY</strong> no Railway (Variables) ou no{" "}
              <code>.env</code> local. Obtenha a chave gratuita em{" "}
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
              A IA analisou as fotos de <strong>{generateResult.productTitle}</strong> para
              gerar textos mais específicos.
            </p>
          </Banner>
        ) : null}

        <InlineGrid columns={{ xs: 1, md: "1fr 1fr" }} gap="400">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Produto
                </Text>
                <FormLayout>
                  <Select
                    label="Produto Shopify"
                    options={[
                      { label: "Selecione um produto…", value: "" },
                      ...products.map((p) => ({ label: p.title, value: p.id })),
                    ]}
                    value={productId}
                    onChange={setProductId}
                    helpText="Obrigatório — a IA lê título, descrição e imagens do produto."
                  />
                  {productPreview ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {productPreview.productType || "Sem tipo"}
                        {productPreview.vendor ? ` · ${productPreview.vendor}` : ""}
                        {productPreview.tags.length
                          ? ` · ${productPreview.tags.slice(0, 4).join(", ")}`
                          : ""}
                      </Text>
                      {productPreview.description ? (
                        <Text as="p" variant="bodySm">
                          {productPreview.description.slice(0, 220)}
                          {productPreview.description.length > 220 ? "…" : ""}
                        </Text>
                      ) : null}
                      {productPreview.images.length > 0 ? (
                        <InlineStack gap="200">
                          {productPreview.images.slice(0, 4).map((img) => (
                            <Thumbnail
                              key={img.url}
                              source={img.url}
                              alt={img.altText || productPreview.title}
                              size="large"
                            />
                          ))}
                        </InlineStack>
                      ) : (
                        <Banner tone="warning">
                          Este produto não tem imagens cadastradas.
                        </Banner>
                      )}
                    </BlockStack>
                  ) : isLoadingProduct && productId ? (
                    <Text as="p" tone="subdued">
                      Carregando produto…
                    </Text>
                  ) : null}
                  <Checkbox
                    label="Analisar imagens do produto com IA (visão)"
                    checked={useProductImages}
                    onChange={setUseProductImages}
                    helpText="Gemini Flash vê até 3 fotos para mencionar cor, acabamento, embalagem etc."
                  />
                  <Checkbox
                    label="Anexar foto do produto na avaliação salva"
                    checked={attachProductImages}
                    onChange={setAttachProductImages}
                    disabled={!useProductImages}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Persona e estilo
                </Text>
                <FormLayout>
                  <Select
                    label="Tipo de produto (contexto extra)"
                    options={[...AI_PRODUCT_TYPES]}
                    value={productType}
                    onChange={setProductType}
                  />
                  {productType === "outro" ? (
                    <TextField
                      label="Tipo personalizado"
                      value={customProductType}
                      onChange={setCustomProductType}
                      autoComplete="off"
                    />
                  ) : null}
                  <Select
                    label="Gênero do autor"
                    options={[...AI_GENDERS]}
                    value={gender}
                    onChange={setGender}
                  />
                  <Select
                    label="Faixa etária"
                    options={[...AI_AGE_RANGES]}
                    value={ageRange}
                    onChange={setAgeRange}
                  />
                  <Select
                    label="Tom"
                    options={[...AI_TONES]}
                    value={tone}
                    onChange={setTone}
                  />
                  <Select
                    label="Idioma"
                    options={[...AI_LOCALES]}
                    value={locale}
                    onChange={setLocale}
                  />
                  <Select
                    label="País"
                    options={[...AI_COUNTRIES]}
                    value={country}
                    onChange={setCountry}
                  />
                  <TextField
                    label="Cidade (opcional)"
                    value={city}
                    onChange={setCity}
                    placeholder="Ex.: São Paulo, Lisboa, Miami"
                    autoComplete="off"
                  />
                  <TextField
                    label="Quantidade"
                    type="number"
                    value={count}
                    onChange={setCount}
                    min={1}
                    max={10}
                    autoComplete="off"
                    helpText="Máximo 10 por geração."
                  />
                  <div>
                    <Text as="p" variant="bodyMd">
                      Nota
                    </Text>
                    <StarRatingPicker value={rating} onChange={setRating} />
                  </div>
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
                    label="Marcar como Verified Buyer"
                    checked={verifiedBuyer}
                    onChange={setVerifiedBuyer}
                    helpText="Desmarque para rascunhos gerados por IA (recomendado)."
                  />
                  <Checkbox
                    label="Salvar como pendente (revisar antes de publicar)"
                    checked={saveAsPending}
                    onChange={setSaveAsPending}
                  />
                </FormLayout>
                <Button
                  variant="primary"
                  onClick={handleGenerate}
                  loading={isGenerating}
                  disabled={!geminiConfigured || !productId}
                >
                  Gerar com IA
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>

          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Preview ({preview.length})
                  </Text>
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
                  <Text as="p" tone="subdued">
                    Selecione um produto com fotos, configure persona/tom e clique em
                    &quot;Gerar com IA&quot;. Edite os textos antes de salvar.
                  </Text>
                ) : (
                  preview.map((review, index) => (
                    <Card key={`preview-${index}`}>
                      <BlockStack gap="200">
                        {review.imageUrl ? (
                          <InlineStack gap="200" blockAlign="center">
                            <Thumbnail
                              source={review.imageUrl}
                              alt="Imagem do produto"
                              size="large"
                            />
                            <Text as="span" variant="bodySm" tone="subdued">
                              Foto anexada na vitrine
                            </Text>
                          </InlineStack>
                        ) : null}
                        <TextField
                          label="Título"
                          value={review.title}
                          onChange={(v) => updatePreview(index, "title", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Texto"
                          value={review.body}
                          onChange={(v) => updatePreview(index, "body", v)}
                          multiline={3}
                          autoComplete="off"
                        />
                        <InlineGrid columns={2} gap="200">
                          <TextField
                            label="Autor"
                            value={review.author}
                            onChange={(v) => updatePreview(index, "author", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Quando"
                            value={review.time}
                            onChange={(v) => updatePreview(index, "time", v)}
                            autoComplete="off"
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                  ))
                )}

                {preview.length > 0 ? (
                  <InlineStack gap="200">
                    <Button variant="primary" onClick={handleSave}>
                      {`Salvar ${preview.length} avaliação(ões)`}
                    </Button>
                    <Button onClick={handleGenerate} loading={isGenerating}>
                      Regenerar
                    </Button>
                  </InlineStack>
                ) : null}
              </BlockStack>
            </Card>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
