import { redisSetEx } from "./redis-cache.server";
import { logWarn } from "./observability.server";

const DLQ_TTL_SECONDS = 7 * 24 * 60 * 60;

type DlqPayload = {
  eventId: string;
  event: string;
  emittedAt: string;
  attempts: number;
  lastError: string;
  destination: string;
  payload: string;
  failedAt: string;
};

export async function persistReviewEventDlq(entry: DlqPayload): Promise<void> {
  try {
    await redisSetEx(`review_events_dlq:${entry.eventId}`, DLQ_TTL_SECONDS, JSON.stringify(entry));
  } catch (error) {
    logWarn("review event dlq persistence failed", {
      eventId: entry.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
