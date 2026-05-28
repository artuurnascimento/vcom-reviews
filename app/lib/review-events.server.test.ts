import { afterEach, describe, expect, it, vi } from "vitest";
import { emitReviewEvent } from "./review-events.server";

const basePayload = {
  event: "review.created" as const,
  emittedAt: "2026-05-27T16:00:00.000Z",
  review: {
    id: "gid://shopify/Metaobject/123",
    status: "approved" as const,
    placement: "homepage" as const,
  },
};

describe("emitReviewEvent", () => {
  afterEach(() => {
    delete process.env.REVIEW_EVENTS_WEBHOOK_URL;
    delete process.env.REVIEW_EVENTS_WEBHOOK_ATTEMPTS;
    delete process.env.REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS;
    vi.restoreAllMocks();
  });

  it("retries and eventually succeeds", async () => {
    process.env.REVIEW_EVENTS_WEBHOOK_URL = "https://example.com/webhook";
    process.env.REVIEW_EVENTS_WEBHOOK_ATTEMPTS = "3";
    process.env.REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS = "1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await emitReviewEvent(basePayload);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall?.[1]?.headers).toMatchObject({
      "x-vcom-review-event": "review.created",
    });
  });

  it("skips when webhook url is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await emitReviewEvent(basePayload);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
