import {
  Badge,
  BlockStack,
  Box,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import type { GeneratedAiReview } from "../lib/ai-review-options";
import type { ReviewPlacement } from "../lib/constants";
import { ReviewStars } from "./ReviewStars";

type Props = {
  review: GeneratedAiReview;
  index: number;
  placement: ReviewPlacement;
  productTitle?: string;
  onChange: (field: keyof GeneratedAiReview, value: string) => void;
};

export function AiReviewPreviewCard({
  review,
  index,
  placement,
  productTitle,
  onChange,
}: Props) {
  const isHomepage = placement === "homepage";

  return (
    <Box
      padding="400"
      borderRadius="300"
      background="bg-surface"
      borderWidth="025"
      borderColor="border"
      shadow="100"
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" blockAlign="center">
            <Box
              padding="100"
              borderRadius="full"
              background="bg-fill-info-secondary"
            >
              <Text as="span" variant="bodySm" fontWeight="bold">
                {String(index + 1).padStart(2, "0")}
              </Text>
            </Box>
            <ReviewStars rating={review.rating} size={14} />
            <Text as="span" variant="bodySm" fontWeight="semibold">
              {review.rating.toFixed(1)}
            </Text>
          </InlineStack>
          <Badge tone={isHomepage ? "success" : "info"}>
            {isHomepage ? "→ Página inicial" : `→ ${productTitle || "Produto"}`}
          </Badge>
        </InlineStack>
        {review.time ? (
          <Text as="span" variant="bodySm" tone="subdued">
            {review.time}
          </Text>
        ) : null}
        {review.imageUrl ? (
          <InlineStack gap="200" blockAlign="center">
            <Thumbnail source={review.imageUrl} alt="Produto" size="medium" />
            <Text as="span" variant="bodySm" tone="subdued">
              Imagem anexada na vitrine
            </Text>
          </InlineStack>
        ) : null}

        <TextField
          label="Título"
          value={review.title}
          onChange={(v) => onChange("title", v)}
          autoComplete="off"
        />
        <TextField
          label="Avaliação"
          value={review.body}
          onChange={(v) => onChange("body", v)}
          multiline={4}
          autoComplete="off"
        />
        <InlineGrid columns={2} gap="300">
          <TextField
            label="Nota"
            type="number"
            value={String(review.rating)}
            onChange={(v) => onChange("rating", v)}
            min={0.5}
            max={5}
            step={0.1}
            autoComplete="off"
          />
          <TextField
            label="Autor"
            value={review.author}
            onChange={(v) => onChange("author", v)}
            autoComplete="off"
          />
        </InlineGrid>
        <TextField
          label="Quando"
          value={review.time}
          onChange={(v) => onChange("time", v)}
          autoComplete="off"
        />
      </BlockStack>
    </Box>
  );
}
