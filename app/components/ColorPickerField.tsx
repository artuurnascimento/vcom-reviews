import { BlockStack, InlineStack, Text, TextField } from "@shopify/polaris";

function normalizeHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [, r, g, b] = v.match(/^#(.)(.)(.)$/) || [];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v}`;
  return "#1d8a42";
}

type Props = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
};

export function ColorPickerField({ label, name, value, onChange }: Props) {
  const pickerValue = normalizeHex(value || "#1d8a42");

  return (
    <BlockStack gap="100">
      <Text as="span" variant="bodySm" fontWeight="medium">
        {label}
      </Text>
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <label
          style={{
            position: "relative",
            display: "block",
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: pickerValue,
            }}
          />
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} — seletor de cor`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              border: "none",
              padding: 0,
            }}
          />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField
            label={label}
            labelHidden
            name={name}
            value={value}
            onChange={onChange}
            autoComplete="off"
            maxLength={7}
          />
        </div>
      </InlineStack>
    </BlockStack>
  );
}
