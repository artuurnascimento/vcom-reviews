import { describe, expect, it, vi } from "vitest";
import {
  processExtensionImportBatch,
  validateExtensionMessage,
  type ExtensionImportMessage,
} from "./import-extension.server";

describe("validateExtensionMessage", () => {
  it("accepts valid payload", () => {
    const result = validateExtensionMessage({
      channel: "vcom.import",
      type: "vcom.import.reviews",
      source: "aliexpress",
      batchId: "batch-1",
      reviews: [
        {
          sourceReviewId: "r1",
          author: "Maria",
          body: "Muito bom",
          rating: 4.8,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects wrong channel", () => {
    const result = validateExtensionMessage({
      channel: "invalid",
      type: "vcom.import.reviews",
      source: "aliexpress",
      batchId: "batch-1",
      reviews: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("processExtensionImportBatch", () => {
  it("imports valid reviews as pending and skips duplicates", async () => {
    const createMock = vi.fn().mockResolvedValue(undefined);
    const message: ExtensionImportMessage = {
      channel: "vcom.import",
      type: "vcom.import.reviews",
      source: "aliexpress",
      batchId: "batch-2",
      reviews: [
        {
          sourceReviewId: "1",
          author: "Ana",
          body: "Excelente",
          title: "Gostei",
          rating: 5,
          placement: "homepage",
        },
        {
          sourceReviewId: "2",
          author: "Ana",
          body: "Excelente",
          title: "Gostei",
          rating: 5,
          placement: "homepage",
        },
      ],
    };

    const result = await processExtensionImportBatch(
      {
        admin: { graphql: vi.fn() } as unknown as Parameters<typeof processExtensionImportBatch>[0]["admin"],
        shop: "demo.myshopify.com",
        message,
      },
      {
        getReviewDedupeKeys: vi.fn().mockResolvedValue(new Set<string>()),
        createReviewWithRetry: createMock,
        rememberReviewDedupeKey: vi.fn(),
        reviewDedupeKey: vi.fn((input) =>
          [input.placement, input.productId || "", input.author, input.title, input.body].join("|"),
        ),
      },
    );

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0]?.[1];
    expect(call?.status).toBe("pending");
  });
});
