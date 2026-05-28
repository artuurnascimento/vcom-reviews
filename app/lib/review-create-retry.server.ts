import { createReview } from "./reviews.server";

const SAVE_THROTTLE_RETRY_ATTEMPTS = 10;
const SAVE_THROTTLE_RETRY_DELAYS_MS = [
  800, 1500, 2500, 4000, 6500, 9000, 12000, 15000, 20000, 30000,
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseThrottleRetryAfterMs(message: string): number | null {
  const retryInMatch = message.match(/retry in ([\d.]+)s/i);
  if (retryInMatch) {
    const sec = parseFloat(retryInMatch[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  const retryAfterMatch = message.match(/retry-?after[:\s]+([\d.]+)/i);
  if (retryAfterMatch) {
    const sec = parseFloat(retryAfterMatch[1]);
    if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
  }
  return null;
}

function isShopifyThrottleError(message: string): boolean {
  return /throttled|too many requests|rate limit|429/i.test(message);
}

export async function createReviewWithRetry(
  admin: Parameters<typeof createReview>[0],
  input: Parameters<typeof createReview>[1],
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SAVE_THROTTLE_RETRY_ATTEMPTS; attempt++) {
    try {
      await createReview(admin, input);
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isThrottle = isShopifyThrottleError(msg);
      if (!isThrottle || attempt === SAVE_THROTTLE_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      const hintedDelay = parseThrottleRetryAfterMs(msg);
      const fallbackDelay =
        SAVE_THROTTLE_RETRY_DELAYS_MS[attempt] ??
        SAVE_THROTTLE_RETRY_DELAYS_MS[SAVE_THROTTLE_RETRY_DELAYS_MS.length - 1];
      const waitMs = Math.max(hintedDelay ?? 0, fallbackDelay);
      await sleep(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
