import { beforeEach, describe, expect, it, vi } from "vitest";

const listAllReviewsMock = vi.fn();
const redisGetMock = vi.fn();
const redisSetExMock = vi.fn();
const redisDeleteByPrefixMock = vi.fn();

vi.mock("./reviews.server", () => ({
  listAllReviews: listAllReviewsMock,
}));

vi.mock("./storefront-reviews-cache.server", () => ({
  getHomepageProxyReviews: vi.fn(),
}));

vi.mock("./redis-cache.server", () => ({
  redisGet: redisGetMock,
  redisSetEx: redisSetExMock,
  redisDeleteByPrefix: redisDeleteByPrefixMock,
}));

describe("review proxy cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    listAllReviewsMock.mockResolvedValue([
      {
        id: "1",
        handle: "a",
        status: "approved",
        placement: "product",
        productId: "gid://shopify/Product/1",
        rating: 5,
        verified_buyer: false,
        title: "t1",
        body: "b1",
        author: "a1",
        time: "10:00",
        images: [],
      },
    ]);
    redisGetMock.mockResolvedValue(null);
    redisSetExMock.mockResolvedValue(undefined);
    redisDeleteByPrefixMock.mockResolvedValue(undefined);
  });

  it("reuses approved product cache per shop", async () => {
    const mod = await import("./review-proxy-cache.server");
    const admin = { graphql: vi.fn() } as unknown as Parameters<
      typeof mod.getProxyApprovedReviews
    >[0];
    const shop = "demo.myshopify.com";

    await mod.getProxyApprovedReviews(
      admin,
      shop,
      "product",
      "gid://shopify/Product/1",
      "photos_first",
    );
    await mod.getProxyApprovedReviews(
      admin,
      shop,
      "product",
      "gid://shopify/Product/1",
      "rating_high",
    );

    expect(listAllReviewsMock).toHaveBeenCalledTimes(1);
  });
});
