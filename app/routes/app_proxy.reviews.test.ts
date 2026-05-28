import { beforeEach, describe, expect, it, vi } from "vitest";

const appProxyMock = vi.fn();
const getProxyApprovedReviewsMock = vi.fn();
const getFileImageUrlsMock = vi.fn();

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: appProxyMock,
    },
  },
}));

vi.mock("../lib/review-proxy-cache.server", () => ({
  getProxyApprovedReviews: getProxyApprovedReviewsMock,
}));

vi.mock("../lib/reviews.server", () => ({
  getFileImageUrls: getFileImageUrlsMock,
}));

describe("app_proxy.reviews loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appProxyMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      session: { shop: "demo.myshopify.com" },
    });
    getProxyApprovedReviewsMock.mockResolvedValue([]);
    getFileImageUrlsMock.mockResolvedValue({});
  });

  it("returns sanitized error on backend failures", async () => {
    const { loader } = await import("./app_proxy.reviews");
    getProxyApprovedReviewsMock.mockRejectedValueOnce(new Error("backend exploded"));

    const res = await loader({
      request: new Request("https://example.com/apps/proxy/reviews?placement=homepage"),
      params: {},
      context: {},
    });
    const payload = (await res.json()) as { error?: string };

    expect(res.status).toBe(500);
    expect(payload.error || "").toContain("Código:");
    expect(payload.error || "").not.toContain("backend exploded");
  });
});
