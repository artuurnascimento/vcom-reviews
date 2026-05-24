import type {
  AiReviewGenerateInput,
  GeneratedAiReview,
} from "./ai-review-options";
import { labelForOption, AI_TONES } from "./ai-review-options";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MAX_REVIEWS_PER_REQUEST = 10;
const MAX_IMAGES_FOR_VISION = 3;

type GeminiInlinePart = {
  inlineData: { mimeType: string; data: string };
};

type GeminiTextPart = { text: string };

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Adicione a chave no Railway ou no arquivo .env.",
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

function buildPrompt(input: AiReviewGenerateInput, hasImages: boolean): string {
  const productType = resolveProductType(input);
  const toneLabel = labelForOption(AI_TONES, input.tone);
  const productLine = input.productTitle
    ? `Produto: "${input.productTitle}"`
    : "Produto: genérico da loja (sem nome específico)";
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

  const visualRules = hasImages
    ? `
8. IMAGENS DO PRODUTO anexadas: analise cor, material, embalagem, acabamento e detalhes visíveis.
9. Mencione 1–2 detalhes visuais de forma natural (como quem recebeu/usou o produto), sem listar como catálogo.
10. Não diga "na foto" ou "na imagem" — escreva como experiência real ("a cor é linda", "chegou bem embalado").`
    : "";

  return `Você gera rascunhos de avaliações de clientes para uma loja online revisar antes de publicar.

Contexto:
- Tipo de produto: ${productType}
- ${productLine}
${descriptionLine ? `- ${descriptionLine}` : ""}
- Idioma: ${input.locale}
- Tom: ${toneLabel}
- Persona do autor: ${persona}
- Nota: ${input.rating} de 5 (o texto deve ser coerente com essa nota)
- Quantidade: ${input.count} avaliações DISTINTAS entre si

Regras:
1. Cada avaliação deve parecer escrita por pessoa diferente (vocabulário, tamanho, estilo).
2. Autor: primeiro nome + inicial do sobrenome (ex.: "Mariana S.", "João P.").
3. Título: curto (3–8 palavras) ou vazio se o tom for muito casual.
4. Corpo: 2–5 frases naturais; evite clichês repetidos ("super recomendo", "mudou minha vida", "nota 10").
5. Campo "time": relativo em idioma ${input.locale} (ex.: "há 2 dias", "há 1 semana", "há 3 semanas").
6. NÃO mencione IA, simulação, loja fictícia ou hashtags.
7. NÃO repita frases entre as avaliações.${visualRules}

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

function parseGeneratedReviews(raw: unknown, expected: number): GeneratedAiReview[] {
  let items: unknown[] = [];

  if (raw && typeof raw === "object" && "reviews" in raw) {
    const reviews = (raw as { reviews: unknown }).reviews;
    items = Array.isArray(reviews) ? reviews : [];
  } else if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object") {
    items = [raw];
  }

  const parsed = items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const body = String(row.body ?? "").trim();
      const author = String(row.author ?? "").trim();
      if (!body || !author) return null;
      return {
        title: String(row.title ?? "").trim(),
        body,
        author,
        time: String(row.time ?? "há alguns dias").trim(),
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

export async function generateReviewsWithGemini(
  input: AiReviewGenerateInput,
): Promise<GeneratedAiReview[]> {
  const count = Math.min(Math.max(1, input.count), MAX_REVIEWS_PER_REQUEST);
  const payload = { ...input, count };
  const imageUrls = (input.productImageUrls || []).filter(Boolean);
  const visionParts = await loadVisionParts(imageUrls);
  const hasImages = visionParts.length > 0;

  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts: Array<GeminiTextPart | GeminiInlinePart> = [
    ...visionParts,
    { text: buildPrompt(payload, hasImages) },
  ];

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
                },
                required: ["body", "author", "time"],
              },
            },
          },
          required: ["reviews"],
        },
      },
    }),
  });

  const json = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!response.ok) {
    const msg =
      json.error?.message ||
      `Erro na API Gemini (${response.status}). Verifique a chave e o modelo.`;
    throw new Error(msg);
  }

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

  const reviews = parseGeneratedReviews(parsed, count);
  return assignProductImages(reviews, imageUrls);
}
