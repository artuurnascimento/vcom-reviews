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
  rating: number;
  count: number;
  /** URLs públicas das imagens do produto (para visão multimodal) */
  productImageUrls?: string[];
};

export type GeneratedAiReview = {
  title: string;
  body: string;
  author: string;
  time: string;
  /** URL da imagem do produto vinculada a esta avaliação (preview + save) */
  imageUrl?: string;
};

export function labelForOption(
  options: ReadonlyArray<{ label: string; value: string }>,
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
