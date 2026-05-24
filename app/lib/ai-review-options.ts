export const AI_PRODUCT_TYPES = [
  { label: "Moda / vestuário", value: "moda" },
  { label: "Beleza / skincare", value: "beleza" },
  { label: "Eletrônicos", value: "eletronicos" },
  { label: "Casa e decoração", value: "casa" },
  { label: "Alimentos / bebidas", value: "alimentos" },
  { label: "Fitness / esportes", value: "fitness" },
  { label: "Joias / acessórios", value: "joias" },
  { label: "Pet", value: "pet" },
  { label: "Infantil", value: "infantil" },
  { label: "Outro", value: "outro" },
] as const;

export const AI_GENDERS = [
  { label: "Aleatório", value: "random" },
  { label: "Feminino", value: "feminino" },
  { label: "Masculino", value: "masculino" },
  { label: "Neutro", value: "neutro" },
] as const;

export const AI_AGE_RANGES = [
  { label: "Aleatório", value: "random" },
  { label: "18–24", value: "18-24" },
  { label: "25–34", value: "25-34" },
  { label: "35–44", value: "35-44" },
  { label: "45–54", value: "45-54" },
  { label: "55+", value: "55+" },
] as const;

export const AI_TONES = [
  { label: "Natural / casual", value: "natural" },
  { label: "Entusiasmado", value: "entusiasmado" },
  { label: "Formal", value: "formal" },
  { label: "Técnico / detalhado", value: "tecnico" },
  { label: "Curto e direto", value: "curto" },
  { label: "Emotivo", value: "emotivo" },
] as const;

export const AI_LOCALES = [
  { label: "Português (Brasil)", value: "pt-BR" },
  { label: "Português (Portugal)", value: "pt-PT" },
  { label: "English (United States)", value: "en-US" },
  { label: "English (United Kingdom)", value: "en-GB" },
  { label: "Español (España)", value: "es-ES" },
  { label: "Español (México)", value: "es-MX" },
  { label: "Español (Argentina)", value: "es-AR" },
  { label: "Français (France)", value: "fr-FR" },
  { label: "Deutsch (Deutschland)", value: "de-DE" },
  { label: "Italiano (Italia)", value: "it-IT" },
  { label: "Nederlands (Nederland)", value: "nl-NL" },
  { label: "Polski (Polska)", value: "pl-PL" },
  { label: "Türkçe (Türkiye)", value: "tr-TR" },
  { label: "日本語 (日本)", value: "ja-JP" },
  { label: "한국어 (대한민국)", value: "ko-KR" },
  { label: "中文 (简体)", value: "zh-CN" },
] as const;

export const AI_COUNTRIES = [
  { label: "Aleatório", value: "random" },
  { label: "Brasil", value: "Brasil" },
  { label: "Portugal", value: "Portugal" },
  { label: "Estados Unidos", value: "Estados Unidos" },
  { label: "Canadá", value: "Canadá" },
  { label: "Reino Unido", value: "Reino Unido" },
  { label: "Irlanda", value: "Irlanda" },
  { label: "Espanha", value: "Espanha" },
  { label: "México", value: "México" },
  { label: "Argentina", value: "Argentina" },
  { label: "Chile", value: "Chile" },
  { label: "Colômbia", value: "Colômbia" },
  { label: "França", value: "França" },
  { label: "Alemanha", value: "Alemanha" },
  { label: "Itália", value: "Itália" },
  { label: "Países Baixos", value: "Países Baixos" },
  { label: "Bélgica", value: "Bélgica" },
  { label: "Suíça", value: "Suíça" },
  { label: "Áustria", value: "Áustria" },
  { label: "Polônia", value: "Polônia" },
  { label: "Turquia", value: "Turquia" },
  { label: "Japão", value: "Japão" },
  { label: "Coreia do Sul", value: "Coreia do Sul" },
  { label: "China", value: "China" },
  { label: "Austrália", value: "Austrália" },
] as const;

/** Idioma padrão ao selecionar um país */
const COUNTRY_DEFAULT_LOCALE: Record<string, string> = {
  Brasil: "pt-BR",
  Portugal: "pt-PT",
  "Estados Unidos": "en-US",
  Canadá: "en-US",
  "Reino Unido": "en-GB",
  Irlanda: "en-GB",
  Espanha: "es-ES",
  México: "es-MX",
  Argentina: "es-AR",
  Chile: "es-ES",
  Colômbia: "es-ES",
  França: "fr-FR",
  Alemanha: "de-DE",
  Itália: "it-IT",
  "Países Baixos": "nl-NL",
  Bélgica: "fr-FR",
  Suíça: "de-DE",
  Áustria: "de-DE",
  Polônia: "pl-PL",
  Turquia: "tr-TR",
  Japão: "ja-JP",
  "Coreia do Sul": "ko-KR",
  China: "zh-CN",
  Austrália: "en-GB",
};

/** Idiomas recomendados por país (aparecem primeiro no select) */
const COUNTRY_SUGGESTED_LOCALES: Record<string, string[]> = {
  Brasil: ["pt-BR", "en-US", "es-ES"],
  Portugal: ["pt-PT", "pt-BR", "en-GB", "es-ES"],
  "Estados Unidos": ["en-US", "es-MX", "fr-FR"],
  Canadá: ["en-US", "fr-FR"],
  "Reino Unido": ["en-GB", "en-US"],
  Irlanda: ["en-GB", "en-US"],
  Espanha: ["es-ES", "en-GB", "fr-FR", "pt-PT"],
  México: ["es-MX", "es-ES", "en-US"],
  Argentina: ["es-AR", "es-ES", "pt-BR"],
  Chile: ["es-ES", "es-AR"],
  Colômbia: ["es-ES", "es-MX"],
  França: ["fr-FR", "en-GB", "de-DE", "es-ES", "it-IT"],
  Alemanha: ["de-DE", "en-GB", "fr-FR", "nl-NL"],
  Itália: ["it-IT", "fr-FR", "en-GB", "de-DE"],
  "Países Baixos": ["nl-NL", "en-GB", "de-DE", "fr-FR"],
  Bélgica: ["fr-FR", "nl-NL", "de-DE", "en-GB"],
  Suíça: ["de-DE", "fr-FR", "it-IT", "en-GB"],
  Áustria: ["de-DE", "en-GB"],
  Polônia: ["pl-PL", "en-GB", "de-DE"],
  Turquia: ["tr-TR", "en-US", "de-DE"],
  Japão: ["ja-JP", "en-US", "ko-KR", "zh-CN"],
  "Coreia do Sul": ["ko-KR", "en-US", "ja-JP", "zh-CN"],
  China: ["zh-CN", "en-US", "ja-JP"],
  Austrália: ["en-GB", "en-US"],
};

export function getDefaultLocaleForCountry(country: string): string {
  if (country === "random") return "pt-BR";
  return COUNTRY_DEFAULT_LOCALE[country] || "en-US";
}

export function getLocaleSelectOptions(country: string): Array<
  | { label: string; value: string }
  | { title: string; options: Array<{ label: string; value: string }> }
> {
  const all = AI_LOCALES.map((l) => ({ label: l.label, value: l.value }));

  if (country === "random") {
    return all;
  }

  const suggestedIds = COUNTRY_SUGGESTED_LOCALES[country] || [
    getDefaultLocaleForCountry(country),
  ];
  const suggestedSet = new Set(suggestedIds);
  const suggested = suggestedIds
    .map((id) => all.find((l) => l.value === id))
    .filter((l): l is { label: string; value: string } => Boolean(l));
  const others = all.filter((l) => !suggestedSet.has(l.value));

  if (others.length === 0) {
    return suggested;
  }

  return [
    {
      title: `Recomendado para ${country}`,
      options: suggested,
    },
    {
      title: "Outros idiomas",
      options: others,
    },
  ];
}

export function isLocaleInOptions(
  locale: string,
  options: ReturnType<typeof getLocaleSelectOptions>,
): boolean {
  for (const item of options) {
    if ("options" in item) {
      if (item.options.some((o) => o.value === locale)) return true;
    } else if (item.value === locale) {
      return true;
    }
  }
  return false;
}

export type AiReviewGenerateInput = {
  productType: string;
  productTitle?: string;
  productDescription?: string;
  customProductType?: string;
  gender: string;
  ageRange: string;
  tone: string;
  locale: string;
  country: string;
  city: string;
  ratingMin: number;
  ratingMax: number;
  count: number;
  /** URLs públicas das imagens do produto (para visão multimodal) */
  productImageUrls?: string[];
};

export type GeneratedAiReview = {
  title: string;
  body: string;
  author: string;
  time: string;
  rating: number;
  /** URL da imagem do produto vinculada a esta avaliação (preview + save) */
  imageUrl?: string;
};

export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(5, Math.max(0.5, Math.round(value * 10) / 10));
}

export function normalizeRatingRange(
  min: number,
  max: number,
): { min: number; max: number } {
  const a = clampRating(min);
  const b = clampRating(max);
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

export function formatRatingRange(min: number, max: number): string {
  const { min: lo, max: hi } = normalizeRatingRange(min, max);
  if (lo === hi) return `${lo.toFixed(1)}★`;
  return `${lo.toFixed(1)} – ${hi.toFixed(1)}★`;
}

/** Distribui notas variadas dentro da faixa para N avaliações. */
export function distributeRatings(count: number, min: number, max: number): number[] {
  const { min: lo, max: hi } = normalizeRatingRange(min, max);
  if (count <= 0) return [];
  if (count === 1) return [hi];

  const ratings: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const base = lo + (hi - lo) * t;
    const jitter = (Math.random() - 0.5) * Math.min(0.3, (hi - lo) * 0.4);
    ratings.push(clampRating(base + jitter));
  }

  for (let i = ratings.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ratings[i], ratings[j]] = [ratings[j], ratings[i]];
  }

  return ratings;
}

export function labelForOption(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
