type RequestMetric = {
  ts: number;
  route: string;
  durationMs: number;
  status: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_POINTS = 3000;

const requests: RequestMetric[] = [];
const counters = new Map<string, number>();

function cleanup(now: number) {
  while (requests.length > 0) {
    const first = requests[0];
    if (now - first.ts <= WINDOW_MS && requests.length <= MAX_POINTS) break;
    requests.shift();
  }
}

export function incrementCounter(name: string, by = 1) {
  counters.set(name, (counters.get(name) || 0) + by);
}

export function recordRequestMetric(route: string, durationMs: number, status: number) {
  const now = Date.now();
  requests.push({ ts: now, route, durationMs, status });
  cleanup(now);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function getMonitoringSnapshot() {
  const now = Date.now();
  cleanup(now);
  const windowed = requests.filter((r) => now - r.ts <= WINDOW_MS);
  const p95 = percentile(
    windowed.map((r) => r.durationMs),
    95,
  );
  const errors5xx = windowed.filter((r) => r.status >= 500).length;
  const proxyAuthFailures = counters.get("proxy_auth_failures") || 0;

  return {
    window_minutes: WINDOW_MS / 60_000,
    requests: windowed.length,
    p95_ms: Math.round(p95),
    errors_5xx: errors5xx,
    proxy_auth_failures_total: proxyAuthFailures,
  };
}

