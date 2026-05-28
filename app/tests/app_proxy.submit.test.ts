import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimits } from "../lib/rate-limit.server";

const appProxyMock = vi.fn();
const createCustomerPendingReviewMock = vi.fn();
const resolveImageIdsFromFormMock = vi.fn();

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: appProxyMock,
    },
  },
}));

vi.mock("../lib/reviews.server", () => ({
  createCustomerPendingReview: createCustomerPendingReviewMock,
}));

vi.mock("../lib/upload.server", () => ({
  resolveImageIdsFromForm: resolveImageIdsFromFormMock,
}));

describe("app_proxy.submit action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
    appProxyMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      session: { shop: "demo.myshopify.com" },
    });
    resolveImageIdsFromFormMock.mockResolvedValue([]);
    createCustomerPendingReviewMock.mockResolvedValue("gid://shopify/Metaobject/1");
  });

  function buildRequest() {
    const form = new FormData();
    form.set("rating", "5");
    form.set("author", "Tester");
    form.set("body", "Great");
    form.set("placement", "homepage");
    return new Request("https://example.com/apps/proxy/submit", {
      method: "POST",
      body: form,
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
  }

  it("returns 429 when rate limited", async () => {
    const { action } = await import("../routes/app_proxy.submit");

    for (let i = 0; i < 12; i += 1) {
      const res = await action({ request: buildRequest(), params: {}, context: {} });
      expect(res.status).toBeLessThan(500);
    }
    const limited = await action({ request: buildRequest(), params: {}, context: {} });
    expect(limited.status).toBe(429);
  });

  it("sanitizes internal errors", async () => {
    const { action } = await import("../routes/app_proxy.submit");
    createCustomerPendingReviewMock.mockRejectedValueOnce(new Error("internal details"));

    const res = await action({ request: buildRequest(), params: {}, context: {} });
    const payload = (await res.json()) as { error?: string };
    expect(res.status).toBe(500);
    expect(payload.error || "").toContain("Código:");
    expect(payload.error || "").not.toContain("internal details");
  });
});
