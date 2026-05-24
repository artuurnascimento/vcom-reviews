import { BlockStack, Text } from "@shopify/polaris";

type Props = {
  label: string;
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
};

export function RangeField({
  label,
  name,
  value,
  min = 0,
  max = 100,
  step = 1,
  suffix = "px",
  onChange,
}: Props) {
  return (
    <BlockStack gap="100">
      <InlineLabel label={label} value={value} suffix={suffix} />
      <input type="hidden" name={name} value={String(value)} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        aria-label={label}
        style={{
          width: "100%",
          accentColor: "#008060",
          cursor: "pointer",
        }}
      />
    </BlockStack>
  );
}

function InlineLabel({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <Text as="span" variant="bodySm" fontWeight="medium">
        {label}
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        {value}
        {suffix}
      </Text>
    </div>
  );
}
