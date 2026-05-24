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
  { label: "English (US)", value: "en-US" },
  { label: "English (UK)", value: "en-GB" },
  { label: "Español", value: "es-ES" },
] as const;

export const AI_COUNTRIES = [
  { label: "Aleatório", value: "random" },
  { label: "Brasil", value: "Brasil" },
  { label: "Portugal", value: "Portugal" },
  { label: "Estados Unidos", value: "Estados Unidos" },
  { label: "Reino Unido", value: "Reino Unido" },
  { label: "Espanha", value: "Espanha" },
  { label: "México", value: "México" },
  { label: "Argentina", value: "Argentina" },
  { label: "França", value: "França" },
  { label: "Alemanha", value: "Alemanha" },
] as const;

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
