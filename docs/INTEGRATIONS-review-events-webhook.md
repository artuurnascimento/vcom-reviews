# Review Events Webhook (Klaviyo / Omnisend)

This integration emits review lifecycle events to an external webhook endpoint.

## Environment variables

- `REVIEW_EVENTS_WEBHOOK_URL` (required to enable)
- `REVIEW_EVENTS_WEBHOOK_SECRET` (optional but recommended)
- `REVIEW_EVENTS_WEBHOOK_TIMEOUT_MS` (optional, default `5000`)
- `REVIEW_EVENTS_WEBHOOK_ATTEMPTS` (optional, default `3`)
- `REVIEW_EVENTS_WEBHOOK_RETRY_BASE_MS` (optional, default `300`)

## Events emitted

- `review.created`
- `review.updated`
- `review.approved`
- `review.rejected`
- `review.deleted`

## Headers

- `content-type: application/json`
- `x-vcom-review-event: <event-name>`
- `x-vcom-emitted-at: <ISO timestamp>`
- `x-vcom-event-id: <stable event id>`
- `idempotency-key: <stable event id>`
- `x-vcom-signature: <hex sha256 hmac>` (only when secret is configured)

## Signature validation

Compute:

- `hex(hmac_sha256(REVIEW_EVENTS_WEBHOOK_SECRET, raw_body))`

Compare with `x-vcom-signature`.

## Retry and fallback

- Non-2xx or network failures are retried with exponential backoff + jitter.
- After all attempts fail, the event is moved to a Redis DLQ key:
  - `review_events_dlq:<event-id>`
  - TTL: 7 days

## Payload example

```json
{
  "event": "review.approved",
  "emittedAt": "2026-05-27T15:00:00.000Z",
  "review": {
    "id": "gid://shopify/Metaobject/123",
    "status": "approved",
    "placement": "homepage",
    "productId": null,
    "rating": 4.8,
    "author": "Maria C.",
    "title": "Entrega rápida",
    "body": "Chegou antes do prazo.",
    "verifiedBuyer": true,
    "imagesCount": 1
  }
}
```

## Recommended no-code flow

1. Point `REVIEW_EVENTS_WEBHOOK_URL` to your automation entrypoint (e.g. Make, n8n, Zapier webhook).
2. Validate signature (if secret configured).
3. Route by `event`:
   - `review.created` / `review.approved`: trigger Klaviyo profile event.
   - `review.rejected` / `review.deleted`: update suppression/internal QA list.

