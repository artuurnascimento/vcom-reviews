import type { CSSProperties } from "react";
import { Badge, BlockStack, Text } from "@shopify/polaris";
import type { StorefrontSettings } from "../lib/storefront-settings.shared";
import { STOREFRONT_LAYOUTS } from "../lib/storefront-layouts";
import { ReviewStars } from "./ReviewStars";

const MOCK_REVIEWS = [
  {
    rating: 5,
    title: "Qualidade excepcional",
    body: "Produto excelente, entrega rápida. Superou minhas expectativas.",
    author: "Maria S.",
    time: "2 dias atrás",
    verified: true,
  },
  {
    rating: 4.5,
    title: "Recomendo muito",
    body: "Atendimento impecável e material de primeira. Compraria de novo.",
    author: "João P.",
    time: "1 semana atrás",
    verified: true,
  },
  {
    rating: 5,
    title: "Perfeito!",
    body: "Exatamente como nas fotos. Muito satisfeita com a compra.",
    author: "Ana L.",
    time: "15 Mar 2025",
    verified: false,
  },
];

type Props = {
  settings: StorefrontSettings;
  shopName?: string;
};

export function StorefrontPreview({ settings, shopName = "Sua loja" }: Props) {
  const layoutName =
    STOREFRONT_LAYOUTS.find((l) => l.id === settings.layout)?.name ?? settings.layout;

  return (
    <BlockStack gap="300">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text as="h2" variant="headingMd">
          Preview ao vivo
        </Text>
        <Badge tone="info">{layoutName}</Badge>
      </div>
      <Text as="p" variant="bodySm" tone="subdued">
        Atualiza instantaneamente conforme você edita. Dados de exemplo.
      </Text>

      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.08)",
          border: "1px solid #e3e3e3",
        }}
      >
        <div
          style={{
            background: "#fafbfb",
            padding: "8px 12px",
            borderBottom: "1px solid #e3e3e3",
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
          <Text as="span" variant="bodySm" tone="subdued">
            Homepage — preview
          </Text>
        </div>

        <div
          style={{
            background: settings.background,
            padding: `${settings.section_padding_top}px ${settings.section_padding_sides}px ${settings.section_padding_bottom}px`,
            maxHeight: 520,
            overflowY: "auto",
          }}
        >
          {settings.trusted_show_header ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                fontSize: settings.trusted_font_size,
                color: settings.trusted_text_color,
                marginBottom: settings.trusted_margin_bottom,
                textAlign: "center",
              }}
            >
              <CheckIcon color={settings.trusted_checkmark_color} />
              <span>
                {shopName} {settings.trusted_text_after}{" "}
                <span style={{ color: settings.trusted_highlight_color, fontWeight: 600 }}>
                  {settings.trusted_text_highlight}
                </span>
              </span>
            </div>
          ) : null}

          <PreviewReviews settings={settings} />

          {settings.footer_show ? (
            <p
              style={{
                marginTop: 16,
                fontSize: 14,
                color: settings.footer_text_color,
                textAlign: "center",
              }}
            >
              {settings.footer_prefix}{" "}
              <strong>4.8</strong> {settings.footer_middle}{" "}
              <strong>128 customers</strong>
              {settings.footer_suffix}
            </p>
          ) : null}

          {settings.show_review_form ? (
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  border: `1px solid ${settings.stars_color}`,
                  background: "transparent",
                  color: settings.stars_color,
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: "default",
                }}
              >
                + {settings.review_form_btn_text || "Escrever avaliação"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewReviews({ settings }: { settings: StorefrontSettings }) {
  const layout = settings.layout;
  const reviews = MOCK_REVIEWS.slice(0, layout === "trustpilot_mosaic" ? 4 : 3);

  if (layout === "trustpilot_split") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 16 }}>
        <SplitSummary settings={settings} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reviews.slice(0, 2).map((r) => (
            <ReviewCard key={r.author} review={r} settings={settings} compact />
          ))}
        </div>
      </div>
    );
  }

  const wrapStyle: CSSProperties = (() => {
    switch (layout) {
      case "trustpilot_grid":
        return { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 };
      case "trustpilot_mosaic":
        return { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 };
      case "trustpilot_list":
        return { display: "flex", flexDirection: "column" };
      case "trustpilot_carousel":
      default:
        return {
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        };
    }
  })();

  return (
    <div style={wrapStyle}>
      {reviews.map((r) => (
        <ReviewCard
          key={r.author}
          review={r}
          settings={settings}
          list={layout === "trustpilot_list"}
          compact={layout === "trustpilot_mosaic"}
        />
      ))}
    </div>
  );
}

function SplitSummary({ settings }: { settings: StorefrontSettings }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 10,
        padding: 12,
        textAlign: "center",
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>4.8</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
        <ReviewStars rating={4.8} size={14} fillColor={settings.stars_color} emptyColor={settings.stars_empty_color} />
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>128 avaliações</div>
    </div>
  );
}

type Review = (typeof MOCK_REVIEWS)[number];

function ReviewCard({
  review,
  settings,
  list = false,
  compact = false,
}: {
  review: Review;
  settings: StorefrontSettings;
  list?: boolean;
  compact?: boolean;
}) {
  if (list) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "36px 1fr",
          gap: 12,
          padding: "14px 0",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#ececf1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            color: "#333",
          }}
        >
          {review.author.charAt(0)}
        </div>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{review.author}</span>
            <ReviewStars rating={review.rating} size={14} fillColor={settings.stars_color} emptyColor={settings.stars_empty_color} />
          </div>
          {settings.show_verified && review.verified ? (
            <VerifiedBadge settings={settings} />
          ) : null}
          <div style={{ fontWeight: 700, fontSize: 14, margin: "6px 0 4px" }}>{review.title}</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.45 }}>{review.body}</div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{review.time}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: list ? "none" : "1px solid rgba(0,0,0,0.08)",
        borderRadius: compact ? 8 : 10,
        padding: compact ? "12px 14px" : "16px 18px",
        background: "#fff",
        boxShadow: compact ? "0 1px 3px rgba(0,0,0,0.06)" : undefined,
      }}
    >
      <ReviewStars rating={review.rating} size={compact ? 14 : 18} fillColor={settings.stars_color} emptyColor={settings.stars_empty_color} />
      {settings.show_verified && review.verified ? (
        <VerifiedBadge settings={settings} />
      ) : null}
      <div style={{ fontWeight: 700, fontSize: compact ? 13 : 15, margin: "8px 0 4px" }}>{review.title}</div>
      <div style={{ fontSize: compact ? 12 : 13, color: "#333", lineHeight: 1.45 }}>{review.body}</div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
        {review.author} — {review.time}
      </div>
    </div>
  );
}

function VerifiedBadge({ settings }: { settings: StorefrontSettings }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        margin: "6px 0",
        fontSize: 11,
        fontWeight: 700,
        color: settings.verified_icon_color,
      }}
    >
      <CheckIcon color={settings.verified_icon_color} size={12} />
      {settings.verified_label}
    </div>
  );
}

function CheckIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill={color}
        d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm10.207 4.207 7-7-1.414-1.414L10.5 14.086 7.207 10.793 5.793 12.207l4 4c.188.188.442.293.707.293s.519-.105.707-.293Z"
      />
    </svg>
  );
}
