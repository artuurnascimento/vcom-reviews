import type { CSSProperties } from "react";
import type { StorefrontLayoutId } from "../lib/storefront-layouts";
import { STOREFRONT_LAYOUTS } from "../lib/storefront-layouts";

type Props = {
  layoutId: StorefrontLayoutId;
  selected: boolean;
  onSelect: () => void;
};

export function LayoutPickerCard({ layoutId, selected, onSelect }: Props) {
  const layout = STOREFRONT_LAYOUTS.find((l) => l.id === layoutId)!;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 12,
        borderRadius: 12,
        border: selected ? "2px solid #008060" : "1px solid #e3e3e3",
        background: selected ? "#f1f8f5" : "#fff",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <LayoutWireframe layoutId={layoutId} />
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#202223" }}>{layout.name}</div>
        <div style={{ fontSize: 12, color: "#6d7175", marginTop: 2, lineHeight: 1.35 }}>
          {layout.description}
        </div>
      </div>
    </button>
  );
}

function LayoutWireframe({ layoutId }: { layoutId: StorefrontLayoutId }) {
  const box = (style: CSSProperties = {}) => (
    <span
      style={{
        display: "block",
        background: "#c4e8d4",
        borderRadius: 3,
        ...style,
      }}
    />
  );

  const wrap: CSSProperties = {
    height: 56,
    background: "#f6f6f7",
    borderRadius: 8,
    padding: 6,
    display: "flex",
    gap: 4,
  };

  if (layoutId === "trustpilot_carousel") {
    return (
      <div style={wrap}>
        {box({ flex: "0 0 42%", height: "100%" })}
        {box({ flex: "0 0 42%", height: "100%", opacity: 0.65 })}
        {box({ flex: "0 0 12%", height: "100%", opacity: 0.35 })}
      </div>
    );
  }

  if (layoutId === "trustpilot_grid") {
    return (
      <div style={{ ...wrap, flexWrap: "wrap" }}>
        {box({ width: "31%", height: 22 })}
        {box({ width: "31%", height: 22 })}
        {box({ width: "31%", height: 22 })}
        {box({ width: "31%", height: 22, opacity: 0.5 })}
        {box({ width: "31%", height: 22, opacity: 0.5 })}
      </div>
    );
  }

  if (layoutId === "trustpilot_split") {
    return (
      <div style={{ ...wrap, gap: 6 }}>
        <div style={{ width: "28%", display: "flex", flexDirection: "column", gap: 3 }}>
          {box({ height: 14, background: "#008060" })}
          {box({ height: 4 })}
          {box({ height: 4 })}
          {box({ height: 4 })}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          {box({ height: 16 })}
          {box({ height: 16, opacity: 0.6 })}
        </div>
      </div>
    );
  }

  if (layoutId === "trustpilot_list") {
    return (
      <div style={{ ...wrap, flexDirection: "column", gap: 4 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#c4e8d4",
                flexShrink: 0,
              }}
            />
            {box({ flex: 1, height: 8, opacity: i === 1 ? 1 : 0.55 })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ ...wrap, flexWrap: "wrap" }}>
      {box({ width: "48%", height: 24 })}
      {box({ width: "48%", height: 24 })}
      {box({ width: "48%", height: 24, opacity: 0.55 })}
      {box({ width: "48%", height: 24, opacity: 0.55 })}
    </div>
  );
}
