import { BlockStack, Box, Card, InlineStack, Text } from "@shopify/polaris";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "success" | "subdued" | "critical";
};

export function StatCard({ label, value, hint, tone = "subdued" }: Props) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone={tone}>
          {label}
        </Text>
        <Text as="p" variant="headingXl">
          {value}
        </Text>
        {hint ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {hint}
          </Text>
        ) : null}
      </BlockStack>
    </Card>
  );
}

type ProgressRowProps = {
  stars: number;
  count: number;
  total: number;
};

export function RatingBar({ stars, count, total }: ProgressRowProps) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <Box minWidth="48px">
        <Text as="span" variant="bodySm">
          {stars} ★
        </Text>
      </Box>
      <Box width="100%" minWidth="120px">
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "#e3e3e3",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "#1d8a42",
              borderRadius: 4,
            }}
          />
        </div>
      </Box>
      <Box minWidth="32px">
        <Text as="span" variant="bodySm" tone="subdued">
          {count}
        </Text>
      </Box>
    </InlineStack>
  );
}
