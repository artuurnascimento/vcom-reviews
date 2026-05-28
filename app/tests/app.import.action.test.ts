import { beforeEach, describe, expect, it, vi } from "vitest";

const adminAuthMock = vi.fn();
const processImportMock = vi.fn();

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: adminAuthMock,
  },
}));

vi.mock("../lib/import-extension.server", async () => {
  const actual = await vi.importActual<typeof import("../lib/import-extension.server")>(
    "../lib/import-extension.server",
  );
  return {
    ...actual,
    processExtensionImportBatch: processImportMock,
  };
});

describe("app.import action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.mockResolvedValue({
      admin: { graphql: vi.fn() },
      session: { shop: "demo.myshopify.com" },
    });
    process.env.IMPORT_EXTENSION_ALLOWED_ORIGINS = "chrome-extension://abc123";
  });

  it("rejects non-allowed origin", async () => {
    const { action } = await import("../routes/app.import");
    const fd = new FormData();
    fd.set("intent", "importExtension");
    fd.set("sourceOrigin", "https://evil.site");
    fd.set(
      "payload",
      JSON.stringify({
        channel: "vcom.import",
        type: "vcom.import.reviews",
        source: "aliexpress",
        batchId: "x1",
        reviews: [{ sourceReviewId: "1", author: "A", body: "B", rating: 5 }],
      }),
    );
    const res = await action({
      request: new Request("https://example.com/app/import", { method: "POST", body: fd }),
      params: {},
      context: {},
    });
    expect(res.status).toBe(403);
  });

  it("processes valid payload", async () => {
    processImportMock.mockResolvedValue({
      ok: true,
      batchId: "x2",
      received: 1,
      imported: 1,
      duplicates: 0,
      invalid: 0,
      failed: 0,
      errors: [],
    });

    const { action } = await import("../routes/app.import");
    const fd = new FormData();
    fd.set("intent", "importExtension");
    fd.set("sourceOrigin", "chrome-extension://abc123");
    fd.set(
      "payload",
      JSON.stringify({
        channel: "vcom.import",
        type: "vcom.import.reviews",
        source: "aliexpress",
        batchId: "x2",
        reviews: [{ sourceReviewId: "1", author: "A", body: "B", rating: 5 }],
      }),
    );
    const res = await action({
      request: new Request("https://example.com/app/import", { method: "POST", body: fd }),
      params: {},
      context: {},
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(processImportMock).toHaveBeenCalledTimes(1);
  });
});
