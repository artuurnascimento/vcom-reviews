import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { redirectWithEmbeddedSearch } from "./embedded-app-path.server";
import { authenticate } from "../shopify.server";
import {
  clampRating,
  DEFAULT_AI_TONE,
  normalizeRatingRange,
  type GeneratedAiReview,
} from "./ai-review-options";
import {
  formatGeminiErrorMessage,
  generateReviewsWithGemini,
  isAiGenerationConfigured,
} from "./ai-reviews.server";
import type { ReviewPlacement } from "./constants";
import { listStoreProducts } from "./product-search.server";
import { createReview, getProductDetails, searchProducts } from "./reviews.server";
import { createShopifyFilesFromUrls } from "./upload.server";
import type {
  GenerateLoaderData,
  GenerateResult,
  ProductLoadResult,
  SearchProductsResult,
} from "./reviews-generate.shared";

function parseGenerateInput(form: FormData) {
  return {
    productType: String(form.get("productType") || "moda"),
    customProductType: String(form.get("customProductType") || "").trim(),
    productId: String(form.get("productId") || "").trim(),
    gender: String(form.get("gender") || "random"),
    ageRange: String(form.get("ageRange") || "random"),
    tone: String(form.get("tone") || DEFAULT_AI_TONE),
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin } = await authenticate.admin(request);
    const shopRes = await admin.graphql(
      `#graphql
      query GeneratePageShop {
        shop {
          name
        }
      }`,
    );
    const shopJson = (await shopRes.json()) as {
      data?: { shop?: { name?: string } };
      errors?: Array<{ message: string }>;
    };

    if (shopJson.errors?.length) {
      throw new Error(shopJson.errors[0]?.message || "Erro ao carregar dados da loja.");
    }

    let initialProducts: Awaited<ReturnType<typeof listStoreProducts>> = [];
    let productsLoadError: string | undefined;

    try {
      initialProducts = await listStoreProducts(admin, { first: 30 });
    } catch (productError) {
      productsLoadError =
        productError instanceof Error
          ? productError.message
          : "Não foi possível carregar o catálogo.";
      console.error("[vcom-reviews] generate loader products", productError);
    }

    return json({
      aiConfigured: isAiGenerationConfigured(),
      shopName: shopJson.data?.shop?.name || "Sua loja",
      initialProducts,
      productsLoadError,
    } satisfies GenerateLoaderData);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[vcom-reviews] generate loader", error);
    return json({
      aiConfigured: isAiGenerationConfigured(),
      shopName: "Sua loja",
      initialProducts: [],
      loaderError:
        error instanceof Error ? error.message : "Não foi possível carregar a página.",
    } satisfies GenerateLoaderData);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
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
      try {
        const product = await getProductDetails(admin, productId);
        return json({ ok: true, product } satisfies ProductLoadResult);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao carregar produto.";
        return json({ ok: false, error: msg } satisfies ProductLoadResult);
      }
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

      return redirectWithEmbeddedSearch(
        request,
        `/app/reviews${status === "pending" ? "/pending" : ""}`,
      );
    }

    if (!isAiGenerationConfigured()) {
      return json({
        ok: false,
        error: "Geração com IA indisponível. Configure a chave da API no servidor (Railway).",
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
        error: "Para analisar imagens, selecione um produto de referência na aba Referência.",
      } satisfies GenerateResult);
    }

    const shopRes = await admin.graphql(
      `#graphql
      query GeneratePageShop {
        shop {
          name
        }
      }`,
    );
    const shopJson = (await shopRes.json()) as { data?: { shop?: { name?: string } } };
    const shopName = shopJson.data?.shop?.name || "Sua loja";

    const { min: ratingMin, max: ratingMax } = normalizeRatingRange(
      payload.ratingMin,
      payload.ratingMax,
    );

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
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[vcom-reviews] generate action", error);
    const raw = error instanceof Error ? error.message : "Erro ao processar o pedido.";
    return json({
      ok: false,
      error: formatGeminiErrorMessage(raw),
    } satisfies GenerateResult);
  }
};
