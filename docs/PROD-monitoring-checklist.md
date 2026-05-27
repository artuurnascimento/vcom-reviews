# VCOM Reviews - P0 Monitoring Checklist

## 1) Environment variables

- `DATABASE_URL` (Railway Postgres)
- `REDIS_URL` (Railway Redis)
- `SENTRY_DSN`
- `SENTRY_TRACES_SAMPLE_RATE=0.1`

## 2) Healthcheck endpoint

- Endpoint: `GET /health`
- Success: HTTP `200` with `"status":"ok"`
- Degraded: HTTP `503` with `"status":"degraded"`

Expected payload fields:

- `checks.app`
- `checks.database`
- `checks.redis`
- `monitoring.p95_ms`
- `monitoring.errors_5xx`
- `monitoring.proxy_auth_failures_total`

## 3) Minimum alerts (recommended)

Create alerts in your monitoring stack (Railway + Sentry):

1. **5xx spike**
   - Condition: `monitoring.errors_5xx >= 10` in 15 min
   - Severity: High
2. **Proxy auth failures**
   - Condition: `monitoring.proxy_auth_failures_total` increasing quickly
   - Severity: High
3. **High latency**
   - Condition: `monitoring.p95_ms > 2500` for 10 min
   - Severity: Medium
4. **Health degraded**
   - Condition: `/health` returns `503`
   - Severity: Critical

## 4) Sentry rules

- Alert on new issue in:
  - `app_proxy.reviews`
  - `app_proxy.submit`
  - SSR render errors
- Alert when issue rate > 5 events / 10 min

## 4.1) Sentry smoke test endpoint (optional but recommended)

Set env vars:

- `ENABLE_SENTRY_TEST_ENDPOINT=1`
- `SENTRY_TEST_TOKEN=<token-forte>`

Run:

- `GET /health/sentry-test?token=<token-forte>`

Expected:

- HTTP `200` with `{ ok: true, sentry.captured: true }`
- Event appears in Sentry as `SENTRY_TEST: controlled production smoke test`

After validation, you can disable by setting:

- `ENABLE_SENTRY_TEST_ENDPOINT=0`

## 5) Manual smoke test after deploy

1. Open app admin page
2. Open reviews list and pending list
3. Save AI-generated batch
4. Approve a pending review
5. Check storefront proxy renders reviews
6. Confirm `/health` is `200` and has non-zero `p95_ms` after traffic

