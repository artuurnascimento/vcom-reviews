import crypto from "node:crypto";
import type { ReviewPlacement, ReviewStatus } from "./constants";
import { logWarn } from "./observability.server";

type ReviewEventType =
  | "review.created"
  | "review.updated"
  | "review.approved"
  | "review.rejected"
  | "review.deleted";

type ReviewEventPayload = {
  event: ReviewEventType;
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

export async function emitReviewEvent(payload: ReviewEventPayload): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;

  const body = JSON.stringify(payload);
  const secret = getWebhookSecret();
  const headers: HeadersInit = {
    "content-type": "application/json",
    "x-vcom-review-event": payload.event,
    "x-vcom-emitted-at": payload.emittedAt,
  };
  if (secret) {
    headers["x-vcom-signature"] = sign(body, secret);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      logWarn("review event webhook non-2xx", {
        status: response.status,
        event: payload.event,
      });
    }
  } catch (error) {
    logWarn("review event webhook failed", {
      event: payload.event,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

