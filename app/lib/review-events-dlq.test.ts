import { afterEach, describe, expect, it, vi } from "vitest";

const persistReviewEventDlqMock = vi.fn();

vi.mock("./review-events-dlq.server", () => ({
  persistReviewEventDlq: persistReviewEventDlqMock,
}));

describe("review events DLQ fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.REVIEW_EVENTS_WEBHOOK_URL;
    delete process.env.REVIEW_EVENTS_WEBHOOK_ATTEMPTS;
    delete process.env.REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS;
  });

  it("persists failed webhook after all retries", async () => {
    process.env.REVIEW_EVENTS_WEBHOOK_URL = "https://example.com/webhook";
    process.env.REVIEW_EVENTS_WEBHOOK_ATTEMPTS = "2";
    process.env.REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response),
    );

    const { emitReviewEvent } = await import("./review-events.server");
    await emitReviewEvent({
      event: "review.updated",
      emittedAt: "2026-05-27T17:00:00.000Z",
      review: {
        id: "gid://shopify/Metaobject/777",
        status: "approved",
        placement: "homepage",
      },
    });

    expect(persistReviewEventDlqMock).toHaveBeenCalledTimes(1);
  });
});
