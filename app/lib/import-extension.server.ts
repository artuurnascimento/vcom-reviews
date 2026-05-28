import { clampRating } from "./ai-review-options";
import type { ReviewFormData, ReviewPlacement } from "./constants";
import { createReviewWithRetry } from "./review-create-retry.server";
import {
  getReviewDedupeKeys,
  rememberReviewDedupeKey,
  reviewDedupeKey,
  type ReviewDedupeInput,
} from "./review-dedupe.server";

export type ExtensionImportReview = {
  sourceReviewId: string;
  author: string;
  body: string;
  rating: number;
  title?: string;
  verifiedBuyer?: boolean;
  time?: string;
  images?: string[];
  productId?: string;
  placement?: ReviewPlacement;
};

export type ExtensionImportMessage = {
  channel: string;
  type: "vcom.import.reviews";
  source: "aliexpress";
  requestId?: string;
  batchId: string;
  sentAt?: string;
  reviews: ExtensionImportReview[];
};

export type ExtensionImportResult = {
  ok: boolean;
  batchId: string;
  received: number;
  imported: number;
  duplicates: number;
  invalid: number;
  failed: number;
  errors: string[];
};

const DEFAULT_CHANNEL = process.env.IMPORT_EXTENSION_CHANNEL?.trim() || "vcom.import";
const MAX_REVIEWS_PER_BATCH = 500;

function sanitizeText(value: unknown, maxLen: number): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

function normalizeProductId(raw: unknown): string | undefined {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  if (value.startsWith("gid://")) return value;
  const digits = value.replace(/\D/g, "");
  return digits ? `gid://shopify/Product/${digits}` : undefined;
}

function normalizePlacement(raw: unknown): ReviewPlacement {
  return String(raw || "").trim() === "product" ? "product" : "homepage";
}

export function parseAllowedExtensionOrigins(): string[] {
  return (process.env.IMPORT_EXTENSION_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isAllowedExtensionOrigin(origin: string): boolean {
  const allowed = parseAllowedExtensionOrigins();
  if (allowed.length === 0) return false;
  return allowed.includes(origin);
}

export function validateExtensionMessage(raw: unknown): {
  ok: true;
  message: ExtensionImportMessage;
} | {
  ok: false;
  error: string;
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Mensagem de importação inválida." };
  }

  const data = raw as Record<string, unknown>;
  if (String(data.channel || "") !== DEFAULT_CHANNEL) {
    return { ok: false, error: "Canal da extensão inválido." };
  }
  if (String(data.type || "") !== "vcom.import.reviews") {
    return { ok: false, error: "Tipo de mensagem inválido." };
  }
  if (String(data.source || "") !== "aliexpress") {
    return { ok: false, error: "Fonte de importação inválida." };
  }
  if (!Array.isArray(data.reviews) || data.reviews.length === 0) {
    return { ok: false, error: "Nenhuma avaliação recebida para importar." };
  }
  if (data.reviews.length > MAX_REVIEWS_PER_BATCH) {
    return { ok: false, error: `Limite de ${MAX_REVIEWS_PER_BATCH} avaliações por lote.` };
  }

  const batchId = sanitizeText(data.batchId, 120);
  if (!batchId) return { ok: false, error: "batchId ausente." };

  return {
    ok: true,
    message: {
      channel: DEFAULT_CHANNEL,
      type: "vcom.import.reviews",
      source: "aliexpress",
      requestId: sanitizeText(data.requestId, 120) || undefined,
      batchId,
      sentAt: sanitizeText(data.sentAt, 120) || undefined,
      reviews: data.reviews as ExtensionImportReview[],
    },
  };
}

function toReviewInput(raw: ExtensionImportReview): {
  ok: true;
  dedupe: ReviewDedupeInput;
  input: ReviewFormData;
} | {
  ok: false;
  error: string;
} {
  const author = sanitizeText(raw.author, 120);
  const body = sanitizeText(raw.body, 4000);
  const title = sanitizeText(raw.title, 180);
  const rating = clampRating(Number(raw.rating));
  const placement = normalizePlacement(raw.placement);
  const productId = normalizeProductId(raw.productId);

  if (!author) return { ok: false, error: "author ausente." };
  if (!body) return { ok: false, error: "body ausente." };
  if (!Number.isFinite(Number(raw.rating))) return { ok: false, error: "rating inválido." };
  if (placement === "product" && !productId) {
    return { ok: false, error: "productId obrigatório para placement=product." };
  }

  return {
    ok: true,
    dedupe: { placement, productId, author, title, body },
    input: {
      rating,
      verified_buyer: Boolean(raw.verifiedBuyer),
      title,
      body,
      author,
      time: sanitizeText(raw.time, 60),
      placement,
      productId,
      imageFileIds: [],
      status: "pending",
    },
  };
}

type ImportDeps = {
  getReviewDedupeKeys: typeof getReviewDedupeKeys;
  createReviewWithRetry: typeof createReviewWithRetry;
  rememberReviewDedupeKey: typeof rememberReviewDedupeKey;
  reviewDedupeKey: typeof reviewDedupeKey;
};

const defaultDeps: ImportDeps = {
  getReviewDedupeKeys,
  createReviewWithRetry,
  rememberReviewDedupeKey,
  reviewDedupeKey,
};

export async function processExtensionImportBatch(
  params: {
    admin: Parameters<typeof createReviewWithRetry>[0];
    shop: string;
    message: ExtensionImportMessage;
  },
  deps: ImportDeps = defaultDeps,
): Promise<ExtensionImportResult> {
  const groupedKeys = new Map<string, Set<string>>();
  const errors: string[] = [];
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  let failed = 0;

  for (const [index, raw] of params.message.reviews.entries()) {
    const normalized = toReviewInput(raw);
    if (!normalized.ok) {
      invalid += 1;
      errors.push(`item ${index + 1}: ${normalized.error}`);
      continue;
    }

    const cacheGroupKey = `${normalized.dedupe.placement}:${normalized.dedupe.productId || "_"}`;
    let dedupeSet = groupedKeys.get(cacheGroupKey);
    if (!dedupeSet) {
      dedupeSet = await deps.getReviewDedupeKeys(
        params.admin,
        params.shop,
        normalized.dedupe.placement,
        normalized.dedupe.productId,
      );
      groupedKeys.set(cacheGroupKey, dedupeSet);
    }

    const fingerprint = deps.reviewDedupeKey(normalized.dedupe);
    if (dedupeSet.has(fingerprint)) {
      duplicates += 1;
      continue;
    }

    try {
      await deps.createReviewWithRetry(params.admin, normalized.input);
      imported += 1;
      dedupeSet.add(fingerprint);
      deps.rememberReviewDedupeKey(
        params.shop,
        normalized.dedupe.placement,
        normalized.dedupe.productId,
        normalized.dedupe,
      );
    } catch (error) {
      failed += 1;
      errors.push(
        `item ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    ok: failed === 0,
    batchId: params.message.batchId,
    received: params.message.reviews.length,
    imported,
    duplicates,
    invalid,
    failed,
    errors,
  };
}
