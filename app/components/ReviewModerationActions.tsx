import { BlockStack, Button, InlineStack } from "@shopify/polaris";
import type { ReviewStatus } from "../lib/constants";

type Props = {
  reviewId: string;
  status: ReviewStatus;
  editUrl: string;
  onSubmit: (data: Record<string, string>) => void;
  compact?: boolean;
};

export function ReviewModerationActions({
  reviewId,
  status,
  editUrl,
  onSubmit,
  compact = false,
}: Props) {
  const isPending = status === "pending";

  const approveBtn = isPending ? (
    <Button
      variant="primary"
      size="slim"
      onClick={() => onSubmit({ intent: "approve", id: reviewId })}
    >
      Aprovar
    </Button>
  ) : null;

  const rejectBtn = isPending ? (
    <Button
      size="slim"
      onClick={() => onSubmit({ intent: "reject", id: reviewId })}
    >
      Rejeitar
    </Button>
  ) : null;

  const editBtn = (
    <Button url={editUrl} size="slim">
      Editar
    </Button>
  );

  const deleteBtn = (
    <Button
      tone="critical"
      size="slim"
      onClick={() => onSubmit({ intent: "delete", id: reviewId })}
    >
      Apagar
    </Button>
  );

  if (compact) {
    return (
      <BlockStack gap="150">
        {isPending ? (
          <InlineStack gap="150" wrap>
            {approveBtn}
            {rejectBtn}
          </InlineStack>
        ) : null}
        <InlineStack gap="150" wrap>
          {editBtn}
          {deleteBtn}
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <InlineStack gap="150" wrap blockAlign="center">
      {approveBtn}
      {rejectBtn}
      {editBtn}
      {deleteBtn}
    </InlineStack>
  );
}
