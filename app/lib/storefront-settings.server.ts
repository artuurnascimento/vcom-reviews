type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export const STOREFRONT_METAFIELD_NAMESPACE = "vcom_reviews";
export const STOREFRONT_METAFIELD_KEY = "storefront_settings";

export interface StorefrontSettings {
  data_source: "auto" | "homepage" | "product";
  background: string;
  section_padding_top: number;
  section_padding_bottom: number;
  section_padding_sides: number;
  trusted_show_header: boolean;
  trusted_text_after: string;
  trusted_text_highlight: string;
  trusted_highlight_color: string;
  trusted_text_color: string;
  trusted_checkmark_color: string;
  trusted_font_size: number;
  trusted_margin_bottom: number;
  stars_color: string;
  stars_empty_color: string;
  show_verified: boolean;
  verified_label: string;
  verified_icon_color: string;
  show_images: boolean;
  reviews_text_max_chars: number;
  reviews_title_max_chars: number;
  reviews_per_page: number;
  pagination_active_color: string;
  pagination_inactive_color: string;
  show_empty_message: boolean;
  empty_message: string;
  show_review_form: boolean;
  review_form_success_message: string;
  review_form_show_images: boolean;
  review_form_images_max: number;
  review_form_btn_text: string;
  review_form_rating_label: string;
  review_form_title_label: string;
  review_form_title_placeholder: string;
  review_form_body_label: string;
  review_form_body_placeholder: string;
  review_form_images_label: string;
  review_form_images_btn_text: string;
  review_form_author_label: string;
  review_form_author_placeholder: string;
  review_form_submit_text: string;
  review_form_cancel_text: string;
  footer_show: boolean;
  footer_prefix: string;
  footer_rating: string;
  footer_middle: string;
  footer_total: string;
  footer_suffix: string;
  footer_text_color: string;
}

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  data_source: "auto",
  background: "#ffffff",
  section_padding_top: 24,
  section_padding_bottom: 24,
  section_padding_sides: 16,
  trusted_show_header: true,
  trusted_text_after: "is trusted by over",
  trusted_text_highlight: "28k+",
  trusted_highlight_color: "#1d8a42",
  trusted_text_color: "#000000",
  trusted_checkmark_color: "#1d8a42",
  trusted_font_size: 15,
  trusted_margin_bottom: 16,
  stars_color: "#1d8a42",
  stars_empty_color: "#dcdce6",
  show_verified: true,
  verified_label: "Verified Buyer",
  verified_icon_color: "#1d8a42",
  show_images: true,
  reviews_text_max_chars: 150,
  reviews_title_max_chars: 80,
  reviews_per_page: 6,
  pagination_active_color: "#1d8a42",
  pagination_inactive_color: "#dcdce6",
  show_empty_message: false,
  empty_message: "Adicione avaliações no app VCOM Reviews.",
  show_review_form: true,
  review_form_success_message: "",
  review_form_show_images: true,
  review_form_images_max: 5,
  review_form_btn_text: "",
  review_form_rating_label: "",
  review_form_title_label: "",
  review_form_title_placeholder: "",
  review_form_body_label: "",
  review_form_body_placeholder: "",
  review_form_images_label: "",
  review_form_images_btn_text: "",
  review_form_author_label: "",
  review_form_author_placeholder: "",
  review_form_submit_text: "",
  review_form_cancel_text: "",
  footer_show: true,
  footer_prefix: "Rated",
  footer_rating: "4.8",
  footer_middle: "/ 5 based on",
  footer_total: "11 customers",
  footer_suffix: ".",
  footer_text_color: "#000000",
};

function mergeSettings(raw: Partial<StorefrontSettings> | null | undefined): StorefrontSettings {
  return { ...DEFAULT_STOREFRONT_SETTINGS, ...(raw || {}) };
}

export async function getStorefrontSettings(admin: AdminApi): Promise<StorefrontSettings> {
  const response = await admin.graphql(
    `#graphql
    query StorefrontSettings {
      shop {
        metafield(namespace: "${STOREFRONT_METAFIELD_NAMESPACE}", key: "${STOREFRONT_METAFIELD_KEY}") {
          value
        }
      }
    }`,
  );
  const json = await response.json();
  const raw = json.data?.shop?.metafield?.value;
  if (!raw) return { ...DEFAULT_STOREFRONT_SETTINGS };
  try {
    return mergeSettings(JSON.parse(raw) as Partial<StorefrontSettings>);
  } catch {
    return { ...DEFAULT_STOREFRONT_SETTINGS };
  }
}

export async function saveStorefrontSettings(
  admin: AdminApi,
  settings: StorefrontSettings,
): Promise<{ ok: boolean; errors: string[] }> {
  const shopRes = await admin.graphql(
    `#graphql
    query ShopId {
      shop { id }
    }`,
  );
  const shopJson = await shopRes.json();
  const ownerId = shopJson.data?.shop?.id;
  if (!ownerId) {
    return { ok: false, errors: ["Loja não encontrada."] };
  }

  const merged = mergeSettings(settings);
  const save = await admin.graphql(
    `#graphql
    mutation SaveStorefrontSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId,
            namespace: STOREFRONT_METAFIELD_NAMESPACE,
            key: STOREFRONT_METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(merged),
          },
        ],
      },
    },
  );
  const saveJson = await save.json();
  const userErrors = saveJson.data?.metafieldsSet?.userErrors || [];
  return {
    ok: userErrors.length === 0,
    errors: userErrors.map((e: { message: string }) => e.message),
  };
}

export async function ensureDefaultStorefrontSettings(admin: AdminApi) {
  await ensureStorefrontMetafieldDefinition(admin);

  const response = await admin.graphql(
    `#graphql
    query HasStorefrontSettings {
      shop {
        metafield(namespace: "${STOREFRONT_METAFIELD_NAMESPACE}", key: "${STOREFRONT_METAFIELD_KEY}") { id }
      }
    }`,
  );
  const json = await response.json();
  if (json.data?.shop?.metafield?.id) return;
  await saveStorefrontSettings(admin, DEFAULT_STOREFRONT_SETTINGS);
}

async function ensureStorefrontMetafieldDefinition(admin: AdminApi) {
  const check = await admin.graphql(
    `#graphql
    query StorefrontMetafieldDef {
      metafieldDefinitions(first: 1, ownerType: SHOP, namespace: "${STOREFRONT_METAFIELD_NAMESPACE}", key: "${STOREFRONT_METAFIELD_KEY}") {
        nodes { id }
      }
    }`,
  );
  const checkJson = await check.json();
  if (checkJson.data?.metafieldDefinitions?.nodes?.length) return;

  const create = await admin.graphql(
    `#graphql
    mutation CreateStorefrontMetafieldDef($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        definition: {
          name: "VCOM Reviews storefront settings",
          namespace: STOREFRONT_METAFIELD_NAMESPACE,
          key: STOREFRONT_METAFIELD_KEY,
          ownerType: "SHOP",
          type: "json",
          access: {
            storefront: "PUBLIC_READ",
          },
        },
      },
    },
  );
  const createJson = await create.json();
  const userErrors = createJson.data?.metafieldDefinitionCreate?.userErrors || [];
  if (userErrors.length) {
    console.error("[vcom-reviews] storefront metafield definition", userErrors);
  }
}

export function parseStorefrontSettingsForm(form: FormData): StorefrontSettings {
  const num = (key: keyof StorefrontSettings, fallback: number) => {
    const v = parseInt(String(form.get(key) ?? ""), 10);
    return Number.isFinite(v) ? v : fallback;
  };
  const bool = (key: keyof StorefrontSettings) => form.get(key) === "on";
  const str = (key: keyof StorefrontSettings) => String(form.get(key) ?? "");

  return mergeSettings({
    data_source: (str("data_source") || "auto") as StorefrontSettings["data_source"],
    background: str("background"),
    section_padding_top: num("section_padding_top", 24),
    section_padding_bottom: num("section_padding_bottom", 24),
    section_padding_sides: num("section_padding_sides", 16),
    trusted_show_header: bool("trusted_show_header"),
    trusted_text_after: str("trusted_text_after"),
    trusted_text_highlight: str("trusted_text_highlight"),
    trusted_highlight_color: str("trusted_highlight_color"),
    trusted_text_color: str("trusted_text_color"),
    trusted_checkmark_color: str("trusted_checkmark_color"),
    trusted_font_size: num("trusted_font_size", 15),
    trusted_margin_bottom: num("trusted_margin_bottom", 16),
    stars_color: str("stars_color"),
    stars_empty_color: str("stars_empty_color"),
    show_verified: bool("show_verified"),
    verified_label: str("verified_label"),
    verified_icon_color: str("verified_icon_color"),
    show_images: bool("show_images"),
    reviews_text_max_chars: num("reviews_text_max_chars", 150),
    reviews_title_max_chars: num("reviews_title_max_chars", 80),
    reviews_per_page: num("reviews_per_page", 6),
    pagination_active_color: str("pagination_active_color"),
    pagination_inactive_color: str("pagination_inactive_color"),
    show_empty_message: bool("show_empty_message"),
    empty_message: str("empty_message"),
    show_review_form: bool("show_review_form"),
    review_form_success_message: str("review_form_success_message"),
    review_form_show_images: bool("review_form_show_images"),
    review_form_images_max: num("review_form_images_max", 5),
    review_form_btn_text: str("review_form_btn_text"),
    review_form_rating_label: str("review_form_rating_label"),
    review_form_title_label: str("review_form_title_label"),
    review_form_title_placeholder: str("review_form_title_placeholder"),
    review_form_body_label: str("review_form_body_label"),
    review_form_body_placeholder: str("review_form_body_placeholder"),
    review_form_images_label: str("review_form_images_label"),
    review_form_images_btn_text: str("review_form_images_btn_text"),
    review_form_author_label: str("review_form_author_label"),
    review_form_author_placeholder: str("review_form_author_placeholder"),
    review_form_submit_text: str("review_form_submit_text"),
    review_form_cancel_text: str("review_form_cancel_text"),
    footer_show: bool("footer_show"),
    footer_prefix: str("footer_prefix"),
    footer_rating: str("footer_rating"),
    footer_middle: str("footer_middle"),
    footer_total: str("footer_total"),
    footer_suffix: str("footer_suffix"),
    footer_text_color: str("footer_text_color"),
  });
}
