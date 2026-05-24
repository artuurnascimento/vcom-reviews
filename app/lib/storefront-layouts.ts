export type StorefrontLayoutId =
  | "trustpilot_carousel"
  | "trustpilot_grid"
  | "trustpilot_split"
  | "trustpilot_list"
  | "trustpilot_mosaic";

export const STOREFRONT_LAYOUTS: Array<{
  id: StorefrontLayoutId;
  name: string;
  description: string;
}> = [
  {
    id: "trustpilot_carousel",
    name: "Carrossel Trustpilot",
    description: "Cards deslizantes no mobile, grade no desktop — layout clássico de widget.",
  },
  {
    id: "trustpilot_grid",
    name: "Grade Trustpilot",
    description: "Cards em grade 3 colunas, estilo vitrine de reviews do Trustpilot.",
  },
  {
    id: "trustpilot_split",
    name: "Resumo + Reviews",
    description: "Nota grande e barras de distribuição à esquerda, reviews à direita.",
  },
  {
    id: "trustpilot_list",
    name: "Lista Trustpilot",
    description: "Lista vertical com avatar, estrelas e texto — feed de avaliações.",
  },
  {
    id: "trustpilot_mosaic",
    name: "Mosaico compacto",
    description: "Cards menores em 2 colunas, denso e ideal para rodapé ou sidebar.",
  },
];

export const DEFAULT_STOREFRONT_LAYOUT: StorefrontLayoutId = "trustpilot_carousel";

export function normalizeStorefrontLayout(value: string | undefined): StorefrontLayoutId {
  const found = STOREFRONT_LAYOUTS.find((l) => l.id === value);
  return found?.id ?? DEFAULT_STOREFRONT_LAYOUT;
}
