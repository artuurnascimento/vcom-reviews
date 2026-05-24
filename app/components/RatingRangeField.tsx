import { BlockStack, Button, InlineGrid, InlineStack, Text, TextField } from "@shopify/polaris";
import { clampRating, formatRatingRange, normalizeRatingRange } from "../lib/ai-review-options";
import { ReviewStars } from "./ReviewStars";

const PRESETS = [
  { label: "4.6 – 5.0", min: 4.6, max: 5 },
  { label: "4.5 – 5.0", min: 4.5, max: 5 },
  { label: "4.0 – 5.0", min: 4, max: 5 },
  { label: "3.5 – 4.5", min: 3.5, max: 4.5 },
] as const;

type Props = {
  min: number;
  max: number;
  count: number;
  onChange: (min: number, max: number) => void;
};

export function RatingRangeField({ min, max, count, onChange }: Props) {
  const normalized = normalizeRatingRange(min, max);

  const updateMin = (raw: string) => {
    const value = clampRating(parseFloat(raw) || normalized.min);
    onChange(value, Math.max(value, normalized.max));
  };

  const updateMax = (raw: string) => {
    const value = clampRating(parseFloat(raw) || normalized.max);
    onChange(Math.min(value, normalized.min), value);
  };

  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodyMd" fontWeight="semibold">
        Faixa de notas
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Cada uma das {count} avaliações recebe uma nota diferente dentro do intervalo (passo 0,1).
      </Text>
      <InlineGrid columns={2} gap="300">
        <TextField
          label="Nota mínima"
          type="number"
          value={String(normalized.min)}
          onChange={updateMin}
          min={0.5}
          max={5}
          step={0.1}
          autoComplete="off"
        />
        <TextField
          label="Nota máxima"
          type="number"
          value={String(normalized.max)}
          onChange={updateMax}
          min={0.5}
          max={5}
          step={0.1}
          autoComplete="off"
        />
      </InlineGrid>
      <InlineStack gap="200" blockAlign="center">
        <ReviewStars rating={normalized.min} size={16} />
        <Text as="span" variant="bodySm" tone="subdued">
          até
        </Text>
        <ReviewStars rating={normalized.max} size={16} />
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {formatRatingRange(normalized.min, normalized.max)}
        </Text>
      </InlineStack>
      <InlineStack gap="150" wrap>
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="slim"
            pressed={normalized.min === preset.min && normalized.max === preset.max}
            onClick={() => onChange(preset.min, preset.max)}
          >
            {preset.label}
          </Button>
        ))}
      </InlineStack>
    </BlockStack>
  );
}
