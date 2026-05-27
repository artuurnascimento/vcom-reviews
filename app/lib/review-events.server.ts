import crypto from "node:crypto";
import type { ReviewPlacement, ReviewStatus } from "./constants";
import { logWarn } from "./observability.server";
import { persistReviewEventDlq } from "./review-events-dlq.server";

type ReviewEventType =
  | "review.created"
  | "review.updated"
  | "review.approved"
  | "review.rejected"
  | "review.deleted";

type ReviewEventPayload = {
  event: ReviewEventType;
  eventId?: string;
  review: {
    id: string;
    status: ReviewStatus;
    placement: ReviewPlacement;
    productId?: string;
    rating?: number;
    author?: string;
    title?: string;
    body?: string;
    verifiedBuyer?: boolean;
    imagesCount?: number;
  };
  emittedAt: string;
};

function getWebhookUrl() {
  return process.env.REVIEW_EVENTS_WEBHOOK_URL?.trim() || "";
}

function getWebhookSecret() {
  return process.env.REVIEW_EVENTS_WEBHOOK_SECRET?.trim() || "";
}

function getTimeoutMs() {
  const parsed = parseInt(process.env.REVIEW_EVENTS_WEBHOOK_TIMEOUT_MS || "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 5000;
}

function sign(body: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function createEventId(payload: ReviewEventPayload) {
  if (payload.eventId?.trim()) return payload.eventId.trim();
  const raw = `${payload.event}:${payload.review.id}:${payload.emittedAt}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getRetryConfig() {
  const attempts = Math.max(1, parseInt(process.env.REVIEW_EVENTS_WEBHOOK_ATTEMPTS || "3", 10) || 3);
  const baseDelayMs = Math.max(
    100,
    parseInt(process.env.REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS || "300", 10) || 300,
  );
  return { attempts, baseDelayMs };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseDelayMs: number, attempt: number) {
  const exp = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const spread = Math.round(exp * 0.3);
  return exp + Math.floor(Math.random() * (spread + 1));
}

export async function emitReviewEvent(payload: ReviewEventPayload): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;

  const eventId = createEventId(payload);
  const body = JSON.stringify({ ...payload, eventId });
  const secret = getWebhookSecret();
  const { attempts, baseDelayMs } = getRetryConfig();
  const headers: HeadersInit = {
    "content-type": "application/json",
    "x-vcom-review-event": payload.event,
    "x-vcom-emitted-at": payload.emittedAt,
    "x-vcom-event-id": eventId,
    "idempotency-key": eventId,
  };
  if (secret) {
    headers["x-vcom-signature"] = sign(body, secret);
  }

  let lastError = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (response.ok) return;

      const willRetry = attempt < attempts;
      logWarn("review event webhook non-2xx", {
        status: response.status,
        event: payload.event,
        eventId,
        attempt,
        willRetry,
      });
      lastError = `HTTP ${response.status}`;
      if (!willRetry) break;
    } catch (error) {
      const willRetry = attempt < attempts;
      logWarn("review event webhook failed", {
        event: payload.event,
        eventId,
        attempt,
        willRetry,
        error: error instanceof Error ? error.message : String(error),
      });
      lastError = error instanceof Error ? error.message : String(error);
      if (!willRetry) break;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await sleep(jitter(baseDelayMs, attempt));
    }
  }

  await persistReviewEventDlq({
    eventId,
    event: payload.event,
    emittedAt: payload.emittedAt,
    attempts,
    lastError: lastError || "unknown",
    destination: url,
    payload: body,
    failedAt: new Date().toISOString(),
  });
  logWarn("review event moved to dlq", { eventId, event: payload.event });
}

