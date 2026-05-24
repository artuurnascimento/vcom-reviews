type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import fs from "node:fs";
import path from "node:path";

export const STOREFRONT_METAFIELD_NAMESPACE = "vcom_reviews";
export const STOREFRONT_METAFIELD_KEY = "storefront_settings";

import {
  coerceStorefrontSettings,
  DEFAULT_STOREFRONT_SETTINGS,
  type StorefrontSettings,
} from "./storefront-settings.shared";
import { normalizeStorefrontLayout } from "./storefront-layouts";
import { ensureHomepageReviewsThemeBlock, type ThemeHomepageSyncResult } from "./theme-homepage.server";

export type { StorefrontLayoutId, StorefrontSettings } from "./storefront-settings.shared";
export { DEFAULT_STOREFRONT_SETTINGS, coerceStorefrontSettings };

function mergeSettings(raw: Partial<StorefrontSettings> | null | undefined): StorefrontSettings {
  return coerceStorefrontSettings(raw);
}

const SETTINGS_DIR = path.join(process.cwd(), "data", "storefront-settings");

function settingsFilePath(shop: string) {
  return path.join(SETTINGS_DIR, `${shop.replace(/[^a-z0-9.-]/gi, "_")}.json`);
}

async function getShopDomain(admin: AdminApi): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query ShopDomain {
      shop { myshopifyDomain }
    }`,
  );
  const json = await response.json();
  return json.data?.shop?.myshopifyDomain ?? null;
}

function readSettingsFile(shop: string): StorefrontSettings | null {
  try {
    const file = settingsFilePath(shop);
    if (!fs.existsSync(file)) return null;
    return mergeSettings(JSON.parse(fs.readFileSync(file, "utf8")) as Partial<StorefrontSettings>);
  } catch {
    return null;
  }
}

function writeSettingsFile(shop: string, settings: StorefrontSettings) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(settingsFilePath(shop), JSON.stringify(settings, null, 2));
}

async function readShopMetafieldSettings(admin: AdminApi): Promise<StorefrontSettings | null> {
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
  if (!raw) return null;
  try {
    return mergeSettings(JSON.parse(raw) as Partial<StorefrontSettings>);
  } catch {
    return null;
  }
}

async function writeShopMetafieldSettings(
  admin: AdminApi,
  settings: StorefrontSettings,
): Promise<string[]> {
  const shopRes = await admin.graphql(`#graphql query { shop { id } }`);
  const shopJson = await shopRes.json();
  const ownerId = shopJson.data?.shop?.id;
  if (!ownerId) return ["Loja não encontrada."];

  const save = await admin.graphql(
    `#graphql
    mutation SaveStorefrontSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
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
            value: JSON.stringify(settings),
          },
        ],
      },
    },
  );
  const saveJson = await save.json();
  return (saveJson.data?.metafieldsSet?.userErrors || []).map(
    (e: { message: string }) => e.message,
  );
}

export async function getStorefrontSettings(admin: AdminApi): Promise<StorefrontSettings> {
  const shop = await getShopDomain(admin);
  const fromMetafield = await readShopMetafieldSettings(admin);
  if (fromMetafield) return fromMetafield;
  if (shop) {
    const fromFile = readSettingsFile(shop);
    if (fromFile) return fromFile;
  }
  return { ...DEFAULT_STOREFRONT_SETTINGS };
}

export async function saveStorefrontSettings(
  admin: AdminApi,
  settings: StorefrontSettings,
  shopDomain?: string,
): Promise<{
  ok: boolean;
  errors: string[];
  themeSync?: ThemeHomepageSyncResult;
}> {
  const shop = await getShopDomain(admin);
  const merged = mergeSettings(settings);
  const errors: string[] = [];

  if (shop) writeSettingsFile(shop, merged);

  const metafieldErrors = await writeShopMetafieldSettings(admin, merged);
  if (metafieldErrors.length) {
    console.warn("[vcom-reviews] shop metafield save", metafieldErrors);
  }

  const themeSync = await ensureHomepageReviewsThemeBlock(admin, shopDomain ?? shop ?? undefined);

  return { ok: true, errors, themeSync };
}

export async function ensureDefaultStorefrontSettings(admin: AdminApi) {
  const shop = await getShopDomain(admin);
  const existing = await getStorefrontSettings(admin);
  const isDefault =
    JSON.stringify(existing) === JSON.stringify(DEFAULT_STOREFRONT_SETTINGS);
  if (!isDefault) return;
  if (shop && readSettingsFile(shop)) return;
  if (await readShopMetafieldSettings(admin)) return;
  await saveStorefrontSettings(admin, DEFAULT_STOREFRONT_SETTINGS);
}

export function parseStorefrontSettingsForm(form: FormData): StorefrontSettings {
  const num = (key: keyof StorefrontSettings, fallback: number) => {
    const v = parseInt(String(form.get(key) ?? ""), 10);
    return Number.isFinite(v) ? v : fallback;
  };
  const bool = (key: keyof StorefrontSettings) => form.get(key) === "on";
  const str = (key: keyof StorefrontSettings) => String(form.get(key) ?? "");

  return mergeSettings({
    layout: normalizeStorefrontLayout(str("layout")),
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
