import * as Sentry from "@sentry/node";

let sentryInitialized = false;

export function initObservability() {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || sentryInitialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
  });
  sentryInitialized = true;
}

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    app: "vcom-reviews",
    message,
    ...(context || {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function logInfo(message: string, context?: LogContext) {
  write("info", message, context);
}

export function logWarn(message: string, context?: LogContext) {
  write("warn", message, context);
}

export function logError(message: string, error: unknown, context?: LogContext) {
  write("error", message, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
  if (sentryInitialized && error instanceof Error) {
    Sentry.captureException(error, { extra: context });
  }
}

export function captureSentryException(error: Error, context?: LogContext) {
  if (!sentryInitialized) return null;
  return Sentry.captureException(error, { extra: context });
}

