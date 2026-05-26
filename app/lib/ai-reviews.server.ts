import type {
  AiReviewGenerateInput,
  GeneratedAiReview,
} from "./ai-review-options";
import {
  clampRating,
  distributeRatings,
  getAiTonePromptBlock,
  MAX_REVIEWS_PER_GEMINI_CALL,
  MAX_REVIEWS_TOTAL,
  normalizeRatingRange,
} from "./ai-review-options";

/** Modelos com cota no plano gratuito (2.0-flash costuma ter limit: 0). */
const GEMINI_MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

const MAX_IMAGES_FOR_VISION = 3;

export function getGeminiModelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL_FALLBACKS[0];
  return [preferred, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== preferred)];
}

export function getDefaultGeminiModel(): string {
  return getGeminiModelCandidates()[0];
}

function isGeminiQuotaError(message: string): boolean {
  return /quota exceeded|limit:\s*0|RESOURCE_EXHAUSTED|rate.?limit/i.test(message);
}

/** Pico de demanda, 503, 429 — vale retry e troca de modelo. */
function isGeminiTransientError(message: string): boolean {
  return (
    isGeminiQuotaError(message) ||
    /high demand|experiencing high|try again later|overloaded|too many requests|temporarily unavailable|service unavailable|503|429|UNAVAILABLE/i.test(
      message,
    )
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatGeminiErrorMessage(message: string): string {
  const retryMatch = message.match(/retry in ([\d.]+)s/i);
  const retryHint = retryMatch
    ? ` Aguarde ~${Math.ceil(parseFloat(retryMatch[1]))} segundos e tente de novo.`
    : "";

  if (/high demand|experiencing high|try again later/i.test(message)) {
    return (
      "A IA está com pico de demanda no momento. O app já tentou novamente automaticamente. " +
      `Aguarde 1–2 minutos e tente de novo, ou use menos avaliações por vez.${retryHint}`
    );
  }

  if (/limit:\s*0/i.test(message)) {
    return (
      `Cota da geração com IA esgotada para o modelo configurado (limite 0). ` +
      `O app tenta modelos alternativos automaticamente; se persistir, ajuste as variáveis no servidor.${retryHint}`
    );
  }

  if (isGeminiQuotaError(message)) {
    return (
      `Limite da geração com IA atingido.${retryHint} ` +
      `Reduza a quantidade de avaliações por vez ou tente novamente mais tarde.`
    );
  }

  return message.replace(/gemini/gi, "IA").replace(/GEMINI_API_KEY/g, "chave da API");
}

type GeminiInlinePart = {
  inlineData: { mimeType: string; data: string };
};

type GeminiTextPart = { text: string };

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Chave da API de geração não configurada no servidor.",
    );
  }
  return key;
}

function resolveProductType(input: AiReviewGenerateInput): string {
  if (input.productType === "outro" && input.customProductType?.trim()) {
    return input.customProductType.trim();
  }
  return input.productType;
}

function buildPrompt(
  input: AiReviewGenerateInput,
  hasImages: boolean,
  targetRatings: number[],
  batch?: { index: number; total: number },
): string {
  const productType = resolveProductType(input);
  const toneBlock = getAiTonePromptBlock(input.tone, input.locale, input.placement);
  const { min, max } = normalizeRatingRange(input.ratingMin, input.ratingMax);
  const isHomepage = input.placement === "homepage";
  const productLine = input.productTitle
    ? isHomepage
      ? `Produto de referência (inspiração para a homepage): "${input.productTitle}"`
      : `Produto: "${input.productTitle}"`
    : isHomepage
      ? "Loja: avaliações gerais sobre a experiência com a marca (sem produto específico)"
      : "Produto: genérico da loja (sem nome específico)";
  const shopLine = input.shopName?.trim() ? `- Loja: ${input.shopName.trim()}` : "";
  const placementLine = isHomepage
    ? `- Destino: PÁGINA INICIAL (carrossel/grid de avaliações da loja — NÃO é review de ficha de produto)`
    : `- Destino: página de PRODUTO (avaliação direta sobre o item)`;
  const descriptionLine = input.productDescription?.trim()
    ? `Descrição do produto: ${input.productDescription.trim().slice(0, 800)}`
    : "";

  const personaParts: string[] = [];
  if (input.gender !== "random") personaParts.push(`gênero ${input.gender}`);
  if (input.ageRange !== "random") personaParts.push(`idade ${input.ageRange}`);
  if (input.country !== "random") {
    const loc = input.city?.trim()
      ? `${input.city.trim()}, ${input.country}`
      : input.country;
    personaParts.push(`localização ${loc}`);
  } else if (input.city?.trim()) {
    personaParts.push(`cidade ${input.city.trim()}`);
  }

  const persona =
    personaParts.length > 0
      ? personaParts.join(", ")
      : "persona variada (gênero, idade e local aleatórios)";

  const ratingLines = targetRatings
    .map((r, i) => `- Avaliação ${i + 1}: nota ${r.toFixed(1)}`)
    .join("\n");

  const homepageRules = isHomepage
    ? `
9. Escreva como cliente da LOJA na homepage: experiência de compra, entrega, atendimento, qualidade geral.
10. Se houver produto de referência, cite-o de forma natural (ex.: "comprei a jaqueta…") mas NÃO como review técnica de página de produto.
11. Evite frases de ficha técnica ("especificação", "SKU", "nesta página do produto").`
    : "";

  const visualRules = hasImages
    ? `
${isHomepage ? "12" : "9"}. IMAGENS anexadas: analise cor, material, embalagem e detalhes visíveis.
${isHomepage ? "13" : "10"}. Mencione 1–2 detalhes visuais de forma natural, sem listar como catálogo.
${isHomepage ? "14" : "11"}. Não diga "na foto" ou "na imagem".`
    : "";

  const batchLine =
    batch && batch.total > 1
      ? `\n- Lote ${batch.index} de ${batch.total}: gere textos NOVOS; não repita títulos, aberturas ou frases de lotes anteriores.`
      : "";

  return `Você gera rascunhos de avaliações de clientes para uma loja online revisar antes de publicar.

Contexto:
${shopLine}
- Tipo de produto / nicho: ${productType}
- ${productLine}
${descriptionLine ? `- ${descriptionLine}` : ""}
${placementLine}
- Idioma: ${input.locale}
- Persona do autor: ${persona}${batchLine}

${toneBlock}
- Faixa de notas: ${min.toFixed(1)} a ${max.toFixed(1)} (escala 0,5–5,0)
- Quantidade: ${input.count} avaliações DISTINTAS entre si

Notas obrigatórias por avaliação (use EXATAMENTE no campo "rating"):
${ratingLines}

Regras:
1. Cada avaliação deve parecer escrita por pessoa diferente (vocabulário, tamanho, estilo).
2. O texto deve ser coerente com a nota atribuída (notas altas = mais positivo; notas mais baixas = críticas leves mas ainda dentro da faixa).
3. Autor: primeiro nome + inicial do sobrenome (ex.: "Mariana S.", "João P.").
4. Título: siga o estilo do tom escolhido acima.
5. Corpo: siga o estilo do tom; evite clichês repetidos entre avaliações.
6. Campo "time": relativo em idioma ${input.locale} (ex.: "há 2 dias", "há 1 semana", "há 3 semanas").
7. NÃO mencione IA, simulação, loja fictícia ou hashtags.
8. NÃO repita frases entre as avaliações.${homepageRules}${visualRules}

Retorne JSON com exatamente ${input.count} item(ns) no array "reviews".`;
}

async function fetchImageInlinePart(url: string): Promise<GeminiInlinePart | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) return null;

    const mimeType =
      response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";

    return {
      inlineData: {
        mimeType,
        data: buffer.toString("base64"),
      },
    };
  } catch {
    return null;
  }
}

async function loadVisionParts(urls: string[]): Promise<GeminiInlinePart[]> {
  const parts: GeminiInlinePart[] = [];
  for (const url of urls.slice(0, MAX_IMAGES_FOR_VISION)) {
    const part = await fetchImageInlinePart(url);
    if (part) parts.push(part);
  }
  return parts;
}

function assignProductImages(
  reviews: GeneratedAiReview[],
  imageUrls: string[],
): GeneratedAiReview[] {
  if (imageUrls.length === 0) return reviews;
  return reviews.map((review, index) => ({
    ...review,
    imageUrl: imageUrls[index % imageUrls.length],
  }));
}

function parseGeneratedReviews(
  raw: unknown,
  expected: number,
  targetRatings: number[],
  ratingMin: number,
  ratingMax: number,
): GeneratedAiReview[] {
  let items: unknown[] = [];

  if (raw && typeof raw === "object" && "reviews" in raw) {
    const reviews = (raw as { reviews: unknown }).reviews;
    items = Array.isArray(reviews) ? reviews : [];
  } else if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object") {
    items = [raw];
  }

  const { min, max } = normalizeRatingRange(ratingMin, ratingMax);

  const parsed = items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const body = String(row.body ?? "").trim();
      const author = String(row.author ?? "").trim();
      if (!body || !author) return null;

      const fallback = targetRatings[index] ?? targetRatings[targetRatings.length - 1] ?? max;
      let rating = clampRating(parseFloat(String(row.rating ?? fallback)) || fallback);
      if (rating < min || rating > max) {
        rating = fallback;
      }

      return {
        title: String(row.title ?? "").trim(),
        body,
        author,
        time: String(row.time ?? "há alguns dias").trim(),
        rating,
      } satisfies GeneratedAiReview;
    })
    .filter((r): r is GeneratedAiReview => r !== null);

  if (parsed.length === 0) {
    throw new Error("A IA não retornou avaliações válidas. Tente novamente.");
  }

  return parsed.slice(0, expected);
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/** Alias para rotas — não expõe o provedor na UI. */
export const isAiGenerationConfigured = isGeminiConfigured;

type GeminiResponseJson = {
  error?: { message?: string };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

async function callGeminiGenerateContent(
  model: string,
  apiKey: string,
  parts: Array<GeminiTextPart | GeminiInlinePart>,
): Promise<GeminiResponseJson> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            reviews: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  author: { type: "string" },
                  time: { type: "string" },
                  rating: { type: "number" },
                },
                required: ["body", "author", "time", "rating"],
              },
            },
          },
          required: ["reviews"],
        },
      },
    }),
  });

  const json = (await response.json()) as GeminiResponseJson;

  if (!response.ok) {
    const msg =
      json.error?.message ||
      `Erro na API Gemini (${response.status}) com modelo ${model}.`;
    throw new Error(msg);
  }

  return json;
}

const GEMINI_RETRY_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

async function callGeminiWithRetries(
  model: string,
  apiKey: string,
  parts: Array<GeminiTextPart | GeminiInlinePart>,
): Promise<GeminiResponseJson> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < GEMINI_RETRY_ATTEMPTS; attempt++) {
    try {
      return await callGeminiGenerateContent(model, apiKey, parts);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(msg);

      if (!isGeminiTransientError(msg) || attempt === GEMINI_RETRY_ATTEMPTS - 1) {
        throw lastError;
      }

      const delayMs = GEMINI_RETRY_DELAYS_MS[attempt] ?? 10_000;
      console.warn(
        `[vcom-reviews] Gemini retry ${attempt + 1}/${GEMINI_RETRY_ATTEMPTS} (${model}) in ${delayMs}ms: ${msg}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Falha ao chamar a IA.");
}

async function generateReviewsWithGeminiBatch(
  input: AiReviewGenerateInput,
  batch?: { index: number; total: number },
): Promise<GeneratedAiReview[]> {
  const count = Math.min(Math.max(1, input.count), MAX_REVIEWS_PER_GEMINI_CALL);
  const payload = { ...input, count };
  const targetRatings = distributeRatings(count, input.ratingMin, input.ratingMax);
  const imageUrls = (input.productImageUrls || []).filter(Boolean);
  const visionParts = await loadVisionParts(imageUrls);
  const hasImages = visionParts.length > 0;

  const apiKey = getApiKey();
  const parts: Array<GeminiTextPart | GeminiInlinePart> = [
    ...visionParts,
    { text: buildPrompt(payload, hasImages, targetRatings, batch) },
  ];

  const models = getGeminiModelCandidates();
  const modelErrors: string[] = [];

  for (const model of models) {
    try {
      const json = await callGeminiWithRetries(model, apiKey, parts);
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Resposta vazia da IA. Tente reduzir a quantidade ou alterar o tom.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Não foi possível interpretar a resposta da IA.");
      }

      const reviews = parseGeneratedReviews(
        parsed,
        count,
        targetRatings,
        input.ratingMin,
        input.ratingMax,
      );
      return assignProductImages(reviews, imageUrls);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isGeminiTransientError(msg)) {
        modelErrors.push(`${model}: ${msg}`);
        console.warn(`[vcom-reviews] Gemini transient on ${model}, trying next model…`);
        continue;
      }
      throw new Error(formatGeminiErrorMessage(msg));
    }
  }

  const last = modelErrors[modelErrors.length - 1] || "Serviço de IA indisponível.";
  throw new Error(formatGeminiErrorMessage(last));
}

export async function generateReviewsWithGemini(
  input: AiReviewGenerateInput,
): Promise<GeneratedAiReview[]> {
  const total = Math.min(Math.max(1, input.count), MAX_REVIEWS_TOTAL);
  const batchSize = MAX_REVIEWS_PER_GEMINI_CALL;
  const totalBatches = Math.ceil(total / batchSize);
  const all: GeneratedAiReview[] = [];

  for (let offset = 0; offset < total; offset += batchSize) {
    const batchCount = Math.min(batchSize, total - offset);
    const batchIndex = Math.floor(offset / batchSize) + 1;
    const batch = await generateReviewsWithGeminiBatch(
      { ...input, count: batchCount },
      totalBatches > 1 ? { index: batchIndex, total: totalBatches } : undefined,
    );
    all.push(...batch);

    if (offset + batchCount < total) {
      await sleep(totalBatches > 5 ? 1_500 : 1_000);
    }
  }

  return all;
}
