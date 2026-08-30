// Banco de serviço do kit multi-tenant (app_credentials, usage_events).
//
// Este repo NÃO tem sistema de migrations próprio: as tabelas de sessão são
// criadas automaticamente pelos session storages do Shopify
// (@shopify/shopify-app-session-storage-{postgresql,sqlite}). Seguimos o mesmo
// padrão aqui — bootstrap idempotente (CREATE TABLE IF NOT EXISTS) na primeira
// query, no mesmo banco que o app já usa:
//   - DATABASE_URL postgres válido → pg.Pool (produção Railway)
//   - senão → ./database.sqlite via sqlite3 (mesmo arquivo das sessões locais)
//
// Timestamps são gravados como TEXT ISO-8601 (UTC) nos dois dialetos — evita
// divergência de tipos e mantém comparações de intervalo corretas
// (ISO ordena lexicograficamente).

import { logError, logWarn } from "./observability.server";

export interface DbRow {
  [column: string]: unknown;
}

interface ServiceDb {
  /** Executa SQL com placeholders `?` (convertidos para $n no postgres). */
  query(sql: string, params?: unknown[]): Promise<DbRow[]>;
}

function isPostgresUrl(raw: string | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

/** Converte placeholders `?` em `$1..$n` para o driver pg. */
function toPgPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function createPgDb(connectionString: string): Promise<ServiceDb> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 5 });
  pool.on("error", (error) => {
    logError("service-db pg pool error", error);
  });
  return {
    async query(sql, params = []) {
      const result = await pool.query(toPgPlaceholders(sql), params);
      return result.rows as DbRow[];
    },
  };
}

async function createSqliteDb(file: string): Promise<ServiceDb> {
  const sqlite3 = (await import("sqlite3")).default;
  const db = new sqlite3.Database(file);
  return {
    query(sql, params = []) {
      return new Promise<DbRow[]>((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
          if (error) reject(error);
          else resolve((rows ?? []) as DbRow[]);
        });
      });
    },
  };
}

const BOOTSTRAP_SQL_COMMON = [
  `CREATE TABLE IF NOT EXISTS app_credentials (
    shop_domain TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_secret_enc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_events_shop_type_at
    ON usage_events (shop, type, occurred_at)`,
];

// A coluna auto-increment difere entre os dialetos; o resto é idêntico.
const USAGE_EVENTS_PG = `CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  shop TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  occurred_at TEXT NOT NULL
)`;
const USAGE_EVENTS_SQLITE = `CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  occurred_at TEXT NOT NULL
)`;

let dbPromise: Promise<ServiceDb> | null = null;

async function initDb(): Promise<ServiceDb> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const usePg = isPostgresUrl(databaseUrl);
  if (databaseUrl && !usePg) {
    logWarn("service-db: DATABASE_URL não é postgres, usando sqlite", {});
  }

  const db = usePg
    ? await createPgDb(databaseUrl as string)
    : await createSqliteDb("./database.sqlite");

  await db.query(usePg ? USAGE_EVENTS_PG : USAGE_EVENTS_SQLITE);
  for (const sql of BOOTSTRAP_SQL_COMMON) {
    await db.query(sql);
  }
  return db;
}

/** Instância única (lazy) — o bootstrap idempotente roda uma vez por boot. */
export function getServiceDb(): Promise<ServiceDb> {
  if (!dbPromise) {
    dbPromise = initDb().catch((error) => {
      // Permite nova tentativa no próximo request em vez de envenenar o cache.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Atalho: query no banco de serviço. */
export async function serviceQuery(
  sql: string,
  params: unknown[] = [],
): Promise<DbRow[]> {
  const db = await getServiceDb();
  return db.query(sql, params);
}

/**
 * Lojas instaladas segundo a tabela de sessões dos session storages do
 * Shopify (`shopify_sessions` nos dois drivers). A tabela é criada pelo
 * próprio storage no primeiro uso — se ainda não existir, devolve lista vazia
 * em vez de derrubar a rota.
 */
export async function listInstalledShops(): Promise<string[]> {
  try {
    const rows = await serviceQuery(
      `SELECT DISTINCT shop FROM shopify_sessions ORDER BY shop`,
    );
    return rows
      .map((row) => (typeof row.shop === "string" ? row.shop : ""))
      .filter(Boolean);
  } catch (error) {
    logWarn("service-db: leitura de shopify_sessions falhou", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
