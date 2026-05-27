import { describe, expect, it } from "vitest";
import { checkRateLimit, clearRateLimits } from "./rate-limit.server";

describe("checkRateLimit", () => {
  it("blocks requests after limit", () => {
    clearRateLimits();
    const key = "submit:test-shop:1.1.1.1";
    const windowMs = 60_000;
    const limit = 2;

    const first = checkRateLimit(key, { limit, windowMs });
    const second = checkRateLimit(key, { limit, windowMs });
    const third = checkRateLimit(key, { limit, windowMs });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
