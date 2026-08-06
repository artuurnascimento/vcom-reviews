import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewRecord } from "./constants";

vi.mock("./review-proxy-cache.server", () => ({
  getApprovedProductReviewsByShop: vi.fn(),
}));

import { getApprovedProductReviewsByShop } from "./review-proxy-cache.server";
import { getTopProductReviews } from "./top-reviews.server";

const mocked = vi.mocked(getApprovedProductReviewsByShop);

function rec(partial: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    handle: partial.id,
    rating: 5,
    verified_buyer: false,
    title: "",
    body: "",
    author: "",
    time: "",
    images: [],
    status: "approved",
    placement: "product",
    productId: "gid://shopify/Product/1",
    ...partial,
  };
}

const admin = {} as Parameters<typeof getTopProductReviews>[0];

describe("getTopProductReviews", () => {
  beforeEach(() => mocked.mockReset());

  it("ordena por maior nota primeiro", async () => {
    mocked.mockResolvedValue([
      rec({ id: "a", rating: 3, productId: "gid://shopify/Product/1" }),
      rec({ id: "b", rating: 5, productId: "gid://shopify/Product/2" }),
      rec({ id: "c", rating: 4, productId: "gid://shopify/Product/3" }),
    ]);

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      perProductCap: 0,
    });

    expect(top.map((r) => r.rating)).toEqual([5, 4, 3]);
  });

  it("aplica o teto por produto para diversificar", async () => {
    mocked.mockResolvedValue([
      rec({ id: "a1", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a2", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a3", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "b1", rating: 4, productId: "gid://shopify/Product/2" }),
    ]);

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      perProductCap: 2,
      limit: 3,
    });

    // Padrão: rodízio entre produtos (a1, b1, a2) em vez de agrupar (a1, a2, b1).
    expect(top.map((r) => r.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("completa o bloco quando o teto por produto deixaria espaço vazio", async () => {
    mocked.mockResolvedValue([
      rec({ id: "a1", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a2", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a3", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "b1", rating: 4, productId: "gid://shopify/Product/2" }),
    ]);

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      perProductCap: 2,
      limit: 4,
    });

    expect(top.map((r) => r.id)).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("agrupa por produto quando o rodízio é desligado", async () => {
    mocked.mockResolvedValue([
      rec({ id: "a1", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a2", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "a3", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "b1", rating: 4, productId: "gid://shopify/Product/2" }),
    ]);

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      perProductCap: 2,
      limit: 10,
      interleave: false,
    });

    expect(top.map((r) => r.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("filtra pelos produtos escolhidos nas configurações", async () => {
    mocked.mockResolvedValue([
      rec({ id: "a1", rating: 5, productId: "gid://shopify/Product/1" }),
      rec({ id: "b1", rating: 4, productId: "gid://shopify/Product/2" }),
    ]);

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      limit: 10,
      productIds: ["2"],
    });

    expect(top.map((r) => r.id)).toEqual(["b1"]);
  });

  it("respeita o limite total", async () => {
    mocked.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) =>
        rec({ id: `r${i}`, rating: 5, productId: `gid://shopify/Product/${i}` }),
      ),
    );

    const top = await getTopProductReviews(admin, "shop.myshopify.com", {
      limit: 12,
      perProductCap: 3,
    });

    expect(top).toHaveLength(12);
  });
});
