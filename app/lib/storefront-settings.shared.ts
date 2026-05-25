import {
  DEFAULT_STOREFRONT_LAYOUT,
  normalizeStorefrontLayout,
  type StorefrontLayoutId,
} from "./storefront-layouts";

export type { StorefrontLayoutId };

export interface StorefrontSettings {
  layout: StorefrontLayoutId;
  data_source: "auto" | "homepage" | "product";
  background: string;
  section_padding_top: number;
  section_padding_bottom: number;
  section_padding_sides: number;
  section_padding_top_mobile: number;
  section_padding_bottom_mobile: number;
  section_padding_sides_mobile: number;
  /** aggregate = título + nota (imagem 1); shop_trusted = linha com nome da loja */
  header_style: "aggregate" | "shop_trusted";
  section_headline: string;
  section_headline_font_size: number;
  section_headline_font_size_mobile: number;
  header_rating_color: string;
  header_stars_color: string;
  header_summary_color: string;
  header_based_on_prefix: string;
  header_show_trustpilot_logo: boolean;
  header_trustpilot_logo_height: number;
  review_title_color: string;
  review_body_color: string;
  review_title_font_size: number;
  review_body_font_size: number;
  review_title_font_size_mobile: number;
  review_body_font_size_mobile: number;
  review_meta_color: string;
  card_background: string;
  card_border_color: string;
  card_border_radius: number;
  card_padding: number;
  cards_gap: number;
  card_border_radius_mobile: number;
  card_padding_mobile: number;
  cards_gap_mobile: number;
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
  /** Avaliações por página no mobile (lista vertical) */
  reviews_per_page_mobile: number;
  /** Linhas visíveis na grade antes de paginar */
  reviews_rows: number;
  /** Colunas visíveis na grade (mobile ≤991px) */
  reviews_columns_mobile: number;
  /** Colunas visíveis na grade (desktop ≥992px) */
  reviews_columns_desktop: number;
  pagination_active_color: string;
  pagination_inactive_color: string;
  show_empty_message: boolean;
  empty_message: string;
  show_review_form: boolean;
  review_form_show_success: boolean;
  review_form_success_message: string;
  review_form_success_bg: string;
  review_form_success_border: string;
  review_form_success_text_color: string;
  review_form_success_icon_color: string;
  review_form_success_show_icon: boolean;
  review_form_success_border_radius: number;
  review_form_success_font_size: number;
  form_panel_background: string;
  form_panel_border_color: string;
  form_panel_border_radius: number;
  form_label_color: string;
  form_input_border_color: string;
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
  footer_trustpilot_show: boolean;
  footer_trustpilot_logo_height: number;
  footer_trustpilot_stars_color: string;
  footer_trustpilot_text_color: string;
  footer_trustpilot_muted_color: string;
  footer_trustpilot_score_label: string;
  footer_trustpilot_reviews_word: string;
  footer_trustpilot_fallback_count: number;
}

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  layout: DEFAULT_STOREFRONT_LAYOUT,
  data_source: "auto",
  background: "#ffffff",
  section_padding_top: 24,
  section_padding_bottom: 24,
  section_padding_sides: 16,
  section_padding_top_mobile: 20,
  section_padding_bottom_mobile: 20,
  section_padding_sides_mobile: 16,
  header_style: "aggregate",
  section_headline: "TRUSTED BY THOUSANDS",
  section_headline_font_size: 22,
  section_headline_font_size_mobile: 20,
  header_rating_color: "#1d8a42",
  header_stars_color: "#e8a317",
  header_summary_color: "#6b6b6b",
  header_based_on_prefix: "Based on",
  header_show_trustpilot_logo: true,
  header_trustpilot_logo_height: 22,
  review_title_color: "#000000",
  review_body_color: "#6b6b6b",
  review_title_font_size: 17,
  review_body_font_size: 15,
  review_title_font_size_mobile: 16,
  review_body_font_size_mobile: 14,
  review_meta_color: "#888888",
  card_background: "#ffffff",
  card_border_color: "rgba(0, 0, 0, 0.08)",
  card_border_radius: 10,
  card_padding: 20,
  cards_gap: 16,
  card_border_radius_mobile: 10,
  card_padding_mobile: 16,
  cards_gap_mobile: 12,
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
  reviews_per_page_mobile: 10,
  reviews_rows: 2,
  reviews_columns_mobile: 1,
  reviews_columns_desktop: 3,
  pagination_active_color: "#1d8a42",
  pagination_inactive_color: "#dcdce6",
  show_empty_message: false,
  empty_message: "Adicione avaliações no app VCOM Reviews.",
  show_review_form: true,
  review_form_show_success: true,
  review_form_success_message: "",
  review_form_success_bg: "#ecfdf5",
  review_form_success_border: "#a7f3d0",
  review_form_success_text_color: "#065f46",
  review_form_success_icon_color: "#065f46",
  review_form_success_show_icon: true,
  review_form_success_border_radius: 10,
  review_form_success_font_size: 15,
  form_panel_background: "#f9fafb",
  form_panel_border_color: "#e5e7eb",
  form_panel_border_radius: 10,
  form_label_color: "#111111",
  form_input_border_color: "#d1d5db",
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
  footer_trustpilot_show: false,
  footer_trustpilot_logo_height: 20,
  footer_trustpilot_stars_color: "",
  footer_trustpilot_text_color: "#191919",
  footer_trustpilot_muted_color: "#6b6b6b",
  footer_trustpilot_score_label: "TrustScore",
  footer_trustpilot_reviews_word: "reviews",
  footer_trustpilot_fallback_count: 0,
};

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Garante settings completos no loader e no estado React (evita crash no preview). */
export function coerceStorefrontSettings(
  raw: Partial<StorefrontSettings> | null | undefined,
): StorefrontSettings {
  const d = DEFAULT_STOREFRONT_SETTINGS;
  const r = raw || {};
  return {
    layout: normalizeStorefrontLayout(str(r.layout, d.layout)),
    data_source:
      r.data_source === "homepage" || r.data_source === "product" || r.data_source === "auto"
        ? r.data_source
        : d.data_source,
    background: str(r.background, d.background),
    section_padding_top: num(r.section_padding_top, d.section_padding_top),
    section_padding_bottom: num(r.section_padding_bottom, d.section_padding_bottom),
    section_padding_sides: num(r.section_padding_sides, d.section_padding_sides),
    section_padding_top_mobile: num(r.section_padding_top_mobile, d.section_padding_top_mobile),
    section_padding_bottom_mobile: num(
      r.section_padding_bottom_mobile,
      d.section_padding_bottom_mobile,
    ),
    section_padding_sides_mobile: num(r.section_padding_sides_mobile, d.section_padding_sides_mobile),
    header_style:
      r.header_style === "shop_trusted" || r.header_style === "aggregate"
        ? r.header_style
        : d.header_style,
    section_headline: str(r.section_headline, d.section_headline),
    section_headline_font_size: num(
      r.section_headline_font_size,
      d.section_headline_font_size,
    ),
    section_headline_font_size_mobile: num(
      r.section_headline_font_size_mobile,
      d.section_headline_font_size_mobile,
    ),
    header_rating_color: str(r.header_rating_color, d.header_rating_color),
    header_stars_color: str(r.header_stars_color, d.header_stars_color),
    header_summary_color: str(r.header_summary_color, d.header_summary_color),
    header_based_on_prefix: str(r.header_based_on_prefix, d.header_based_on_prefix),
    header_show_trustpilot_logo: bool(
      r.header_show_trustpilot_logo,
      d.header_show_trustpilot_logo,
    ),
    header_trustpilot_logo_height: Math.min(
      48,
      Math.max(12, num(r.header_trustpilot_logo_height, d.header_trustpilot_logo_height)),
    ),
    review_title_color: str(r.review_title_color, d.review_title_color),
    review_body_color: str(r.review_body_color, d.review_body_color),
    review_title_font_size: num(r.review_title_font_size, d.review_title_font_size),
    review_body_font_size: num(r.review_body_font_size, d.review_body_font_size),
    review_title_font_size_mobile: num(
      r.review_title_font_size_mobile,
      d.review_title_font_size_mobile,
    ),
    review_body_font_size_mobile: num(
      r.review_body_font_size_mobile,
      d.review_body_font_size_mobile,
    ),
    review_meta_color: str(r.review_meta_color, d.review_meta_color),
    card_background: str(r.card_background, d.card_background),
    card_border_color: str(r.card_border_color, d.card_border_color),
    card_border_radius: num(r.card_border_radius, d.card_border_radius),
    card_padding: num(r.card_padding, d.card_padding),
    cards_gap: num(r.cards_gap, d.cards_gap),
    card_border_radius_mobile: num(r.card_border_radius_mobile, d.card_border_radius_mobile),
    card_padding_mobile: num(r.card_padding_mobile, d.card_padding_mobile),
    cards_gap_mobile: num(r.cards_gap_mobile, d.cards_gap_mobile),
    trusted_show_header: bool(r.trusted_show_header, d.trusted_show_header),
    trusted_text_after: str(r.trusted_text_after, d.trusted_text_after),
    trusted_text_highlight: str(r.trusted_text_highlight, d.trusted_text_highlight),
    trusted_highlight_color: str(r.trusted_highlight_color, d.trusted_highlight_color),
    trusted_text_color: str(r.trusted_text_color, d.trusted_text_color),
    trusted_checkmark_color: str(r.trusted_checkmark_color, d.trusted_checkmark_color),
    trusted_font_size: num(r.trusted_font_size, d.trusted_font_size),
    trusted_margin_bottom: num(r.trusted_margin_bottom, d.trusted_margin_bottom),
    stars_color: str(r.stars_color, d.stars_color),
    stars_empty_color: str(r.stars_empty_color, d.stars_empty_color),
    show_verified: bool(r.show_verified, d.show_verified),
    verified_label: str(r.verified_label, d.verified_label),
    verified_icon_color: str(r.verified_icon_color, d.verified_icon_color),
    show_images: bool(r.show_images, d.show_images),
    reviews_text_max_chars: num(r.reviews_text_max_chars, d.reviews_text_max_chars),
    reviews_title_max_chars: num(r.reviews_title_max_chars, d.reviews_title_max_chars),
    reviews_per_page: num(r.reviews_per_page, d.reviews_per_page),
    reviews_per_page_mobile: Math.min(
      20,
      Math.max(1, num(r.reviews_per_page_mobile, d.reviews_per_page_mobile)),
    ),
    reviews_rows: num(r.reviews_rows, d.reviews_rows),
    reviews_columns_mobile: Math.min(
      2,
      Math.max(1, num(r.reviews_columns_mobile, d.reviews_columns_mobile)),
    ),
    reviews_columns_desktop: Math.min(
      4,
      Math.max(1, num(r.reviews_columns_desktop, d.reviews_columns_desktop)),
    ),
    pagination_active_color: str(r.pagination_active_color, d.pagination_active_color),
    pagination_inactive_color: str(r.pagination_inactive_color, d.pagination_inactive_color),
    show_empty_message: bool(r.show_empty_message, d.show_empty_message),
    empty_message: str(r.empty_message, d.empty_message),
    show_review_form: bool(r.show_review_form, d.show_review_form),
    review_form_show_success: bool(r.review_form_show_success, d.review_form_show_success),
    review_form_success_message: str(r.review_form_success_message, d.review_form_success_message),
    review_form_success_bg: str(r.review_form_success_bg, d.review_form_success_bg),
    review_form_success_border: str(r.review_form_success_border, d.review_form_success_border),
    review_form_success_text_color: str(
      r.review_form_success_text_color,
      d.review_form_success_text_color,
    ),
    review_form_success_icon_color: str(r.review_form_success_icon_color, d.review_form_success_icon_color),
    review_form_success_show_icon: bool(r.review_form_success_show_icon, d.review_form_success_show_icon),
    review_form_success_border_radius: num(
      r.review_form_success_border_radius,
      d.review_form_success_border_radius,
    ),
    review_form_success_font_size: num(r.review_form_success_font_size, d.review_form_success_font_size),
    form_panel_background: str(r.form_panel_background, d.form_panel_background),
    form_panel_border_color: str(r.form_panel_border_color, d.form_panel_border_color),
    form_panel_border_radius: num(r.form_panel_border_radius, d.form_panel_border_radius),
    form_label_color: str(r.form_label_color, d.form_label_color),
    form_input_border_color: str(r.form_input_border_color, d.form_input_border_color),
    review_form_show_images: bool(r.review_form_show_images, d.review_form_show_images),
    review_form_images_max: num(r.review_form_images_max, d.review_form_images_max),
    review_form_btn_text: str(r.review_form_btn_text, d.review_form_btn_text),
    review_form_rating_label: str(r.review_form_rating_label, d.review_form_rating_label),
    review_form_title_label: str(r.review_form_title_label, d.review_form_title_label),
    review_form_title_placeholder: str(
      r.review_form_title_placeholder,
      d.review_form_title_placeholder,
    ),
    review_form_body_label: str(r.review_form_body_label, d.review_form_body_label),
    review_form_body_placeholder: str(
      r.review_form_body_placeholder,
      d.review_form_body_placeholder,
    ),
    review_form_images_label: str(r.review_form_images_label, d.review_form_images_label),
    review_form_images_btn_text: str(r.review_form_images_btn_text, d.review_form_images_btn_text),
    review_form_author_label: str(r.review_form_author_label, d.review_form_author_label),
    review_form_author_placeholder: str(
      r.review_form_author_placeholder,
      d.review_form_author_placeholder,
    ),
    review_form_submit_text: str(r.review_form_submit_text, d.review_form_submit_text),
    review_form_cancel_text: str(r.review_form_cancel_text, d.review_form_cancel_text),
    footer_show: bool(r.footer_show, d.footer_show),
    footer_prefix: str(r.footer_prefix, d.footer_prefix),
    footer_rating: str(r.footer_rating, d.footer_rating),
    footer_middle: str(r.footer_middle, d.footer_middle),
    footer_total: str(r.footer_total, d.footer_total),
    footer_suffix: str(r.footer_suffix, d.footer_suffix),
    footer_text_color: str(r.footer_text_color, d.footer_text_color),
    footer_trustpilot_show: bool(r.footer_trustpilot_show, d.footer_trustpilot_show),
    footer_trustpilot_logo_height: num(r.footer_trustpilot_logo_height, d.footer_trustpilot_logo_height),
    footer_trustpilot_stars_color: str(r.footer_trustpilot_stars_color, d.footer_trustpilot_stars_color),
    footer_trustpilot_text_color: str(r.footer_trustpilot_text_color, d.footer_trustpilot_text_color),
    footer_trustpilot_muted_color: str(r.footer_trustpilot_muted_color, d.footer_trustpilot_muted_color),
    footer_trustpilot_score_label: str(r.footer_trustpilot_score_label, d.footer_trustpilot_score_label),
    footer_trustpilot_reviews_word: str(r.footer_trustpilot_reviews_word, d.footer_trustpilot_reviews_word),
    footer_trustpilot_fallback_count: num(r.footer_trustpilot_fallback_count, d.footer_trustpilot_fallback_count),
  };
}
