import { createClient } from "redis";
import { logWarn } from "./observability.server";

let client: ReturnType<typeof createClient> | null = null;
let connectPromise: Promise<void> | null = null;

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

function getClient() {
  const url = getRedisUrl();
  if (!url) return null;
  if (client) return client;

  client = createClient({ url });
  client.on("error", (error) => {
    logWarn("redis client error", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return client;
}

async function ensureConnected() {
  const c = getClient();
  if (!c) return null;
  if (c.isOpen) return c;
  if (!connectPromise) {
    connectPromise = c.connect().catch((error) => {
      logWarn("redis connect failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      connectPromise = null;
    }) as Promise<void>;
  }
  await connectPromise;
  return c.isOpen ? c : null;
}

export async function redisGet(key: string): Promise<string | null> {
  const c = await ensureConnected();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch (error) {
    logWarn("redis get failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function redisSetEx(key: string, ttlSeconds: number, value: string): Promise<void> {
  const c = await ensureConnected();
  if (!c) return;
  try {
    await c.set(key, value, { EX: ttlSeconds });
  } catch (error) {
    logWarn("redis set failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function redisDeleteByPrefix(prefix: string): Promise<void> {
  const c = await ensureConnected();
  if (!c) return;
  try {
    const keys = await c.keys(`${prefix}*`);
    if (keys.length > 0) {
      await c.del(keys);
    }
  } catch (error) {
    logWarn("redis prefix delete failed", {
      prefix,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function redisDelete(key: string): Promise<void> {
  const c = await ensureConnected();
  if (!c) return;
  try {
    await c.del(key);
  } catch (error) {
    logWarn("redis delete failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

