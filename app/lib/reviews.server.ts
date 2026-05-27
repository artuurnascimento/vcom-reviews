type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import {
  REVIEW_METAOBJECT_TYPE,
  LEGACY_REVIEW_METAOBJECT_TYPE,
  MAX_STOREFRONT_REVIEWS,
  REVIEWS_GRAPHQL_PAGE_SIZE,
  type ReviewFormData,
  type ReviewPlacement,
  type ReviewRecord,
  type ReviewStatus,
} from "./constants";
import { ensureReviewDefinitionReady } from "./metaobject-setup.server";
import { invalidateReviewDedupeCache } from "./review-dedupe.server";
import { emitReviewEvent } from "./review-events.server";
import { syncStorefrontReviewStats } from "./storefront-stats.server";

function scheduleStorefrontStatsSync(admin: AdminApi) {
  void syncStorefrontReviewStats(admin);
}

function parseStatus(raw: string | null | undefined): ReviewStatus {
  if (raw === "pending" || raw === "rejected") return raw;
  return "approved";
}

function parsePlacement(raw: string | null | undefined): ReviewPlacement {
  return raw === "product" ? "product" : "homepage";
}

function parseMetaobjectNode(node: {
  id: string;
  handle: string;
  fields: Array<{ key: string; value: string | null; type: string }>;
}): ReviewRecord {
  const map = Object.fromEntries(node.fields.map((f) => [f.key, f.value]));
  let images: string[] = [];
  if (map.images) {
    try {
      const parsed = JSON.parse(map.images);
      images = Array.isArray(parsed) ? parsed : [];
    } catch {
      images = [];
    }
  }
  return {
    id: node.id,
    handle: node.handle,
    rating: parseFloat(map.rating || "5") || 5,
    verified_buyer: map.verified_buyer === "true",
    title: map.title || "",
    body: map.body || "",
    author: map.author || "",
    time: map.time || "",
    images,
    status: parseStatus(map.status),
    placement: parsePlacement(map.placement),
    productId: map.product_id || undefined,
  };
}

async function listReviewsByType(
  admin: AdminApi,
  type: string,
  { first = 50, after }: { first?: number; after?: string } = {},
) {
  const response = await admin.graphql(
    `#graphql
    query ListReviews($type: String!, $first: Int!, $after: String) {
      metaobjects(type: $type, first: $first, after: $after, sortKey: "updated_at", reverse: true) {
        edges {
          cursor
          node {
            id
            handle
            fields { key value type }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      variables: { type, first, after: after ?? null },
    },
  );
  const json = await response.json();
  const edges = json.data?.metaobjects?.edges || [];
  return {
    reviews: edges.map((e: { node: Parameters<typeof parseMetaobjectNode>[0] }) =>
      parseMetaobjectNode(e.node),
    ),
    pageInfo: json.data?.metaobjects?.pageInfo,
  };
}

export async function listReviews(
  admin: AdminApi,
  { first = 50, after }: { first?: number; after?: string } = {},
) {
  const [primary, legacy] = await Promise.all([
    listReviewsByType(admin, REVIEW_METAOBJECT_TYPE, { first, after }),
    listReviewsByType(admin, LEGACY_REVIEW_METAOBJECT_TYPE, { first, after }),
  ]);

  const seen = new Set<string>();
  const reviews = [...primary.reviews, ...legacy.reviews].filter((review) => {
    if (seen.has(review.handle)) return false;
    seen.add(review.handle);
    return true;
  });

  return {
    reviews,
    pageInfo: primary.pageInfo,
  };
}

/** Admin + app proxy — percorre todas as páginas (até MAX_STOREFRONT_REVIEWS). */
export async function listAllReviews(
  admin: AdminApi,
  max = MAX_STOREFRONT_REVIEWS,
): Promise<ReviewRecord[]> {
  const seen = new Set<string>();
  const all: ReviewRecord[] = [];

  async function fetchType(type: string) {
    let after: string | undefined;
    while (all.length < max) {
      const pageSize = Math.min(REVIEWS_GRAPHQL_PAGE_SIZE, max - all.length);
      const batch = await listReviewsByType(admin, type, { first: pageSize, after });
      for (const review of batch.reviews) {
        if (seen.has(review.handle)) continue;
        seen.add(review.handle);
        all.push(review);
      }
      if (!batch.pageInfo?.hasNextPage) break;
      after = batch.pageInfo.endCursor;
    }
  }

  await fetchType(REVIEW_METAOBJECT_TYPE);
  await fetchType(LEGACY_REVIEW_METAOBJECT_TYPE);

  return all;
}

export async function listPendingReviews(admin: AdminApi) {
  const reviews = await listAllReviews(admin);
  return reviews.filter((r) => r.status === "pending");
}

export async function listRejectedReviews(admin: AdminApi) {
  const reviews = await listAllReviews(admin);
  return reviews.filter((r) => r.status === "rejected");
}

export async function getReview(admin: AdminApi, id: string) {
  const response = await admin.graphql(
    `#graphql
    query GetReview($id: ID!) {
      metaobject(id: $id) {
        id
        handle
        fields { key value type }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const node = json.data?.metaobject;
  if (!node) return null;
  return parseMetaobjectNode(node);
}

export async function createReview(admin: AdminApi, data: ReviewFormData) {
  await ensureDefinition(admin);
  const payload: ReviewFormData = {
    ...data,
    status: data.status ?? "approved",
  };
  return createMetaobject(admin, payload);
}

async function ensureDefinition(admin: AdminApi) {
  const result = await ensureReviewDefinitionReady(admin);
  if (!result.ok) {
    throw new Error(
      result.errors.join(". ") ||
        "Configuração incompleta. Abra Configuração e clique em Executar configuração.",
    );
  }
}

/** Avaliação enviada pelo cliente na vitrine — aguarda aprovação */
export async function createCustomerPendingReview(
  admin: AdminApi,
  data: Omit<ReviewFormData, "verified_buyer" | "status"> & {
    verified_buyer?: boolean;
  },
) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return createReview(admin, {
    ...data,
    verified_buyer: data.verified_buyer ?? false,
    time: data.time || time,
    status: "pending",
  });
}

export async function approveReview(admin: AdminApi, id: string) {
  const review = await getReview(admin, id);
  if (!review) throw new Error("Avaliação não encontrada.");
  if (review.status === "approved") return id;

  await updateMetaobjectStatus(admin, id, "approved", review);
  scheduleStorefrontStatsSync(admin);
  void emitReviewEvent({
    event: "review.approved",
    emittedAt: new Date().toISOString(),
    review: {
      id,
      status: "approved",
      placement: review.placement,
      productId: review.productId,
      rating: review.rating,
      author: review.author,
      title: review.title,
      body: review.body,
      verifiedBuyer: review.verified_buyer,
      imagesCount: review.images.length,
    },
  });
  return id;
}

export async function rejectReview(admin: AdminApi, id: string) {
  const review = await getReview(admin, id);
  if (!review) throw new Error("Avaliação não encontrada.");
  await updateMetaobjectStatus(admin, id, "rejected", review);
  scheduleStorefrontStatsSync(admin);
  void emitReviewEvent({
    event: "review.rejected",
    emittedAt: new Date().toISOString(),
    review: {
      id,
      status: "rejected",
      placement: review.placement,
      productId: review.productId,
      rating: review.rating,
      author: review.author,
      title: review.title,
      body: review.body,
      verifiedBuyer: review.verified_buyer,
      imagesCount: review.images.length,
    },
  });
  return id;
}

export async function approveReviewsByIds(
  admin: AdminApi,
  ids: string[],
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await approveReview(admin, id);
      processed++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { processed, errors };
}

export async function rejectReviewsByIds(
  admin: AdminApi,
  ids: string[],
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await rejectReview(admin, id);
      processed++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { processed, errors };
}

export async function approveAllPendingReviews(admin: AdminApi): Promise<number> {
  const pending = await listPendingReviews(admin);
  const { processed } = await approveReviewsByIds(
    admin,
    pending.map((r) => r.id),
  );
  return processed;
}

export async function approveAllRejectedReviews(admin: AdminApi): Promise<number> {
  const rejected = await listRejectedReviews(admin);
  const { processed } = await approveReviewsByIds(
    admin,
    rejected.map((r) => r.id),
  );
  return processed;
}

export async function rejectAllPendingReviews(admin: AdminApi): Promise<number> {
  const pending = await listPendingReviews(admin);
  const { processed } = await rejectReviewsByIds(
    admin,
    pending.map((r) => r.id),
  );
  return processed;
}

export async function updateReview(
  admin: AdminApi,
  id: string,
  data: ReviewFormData,
) {
  const existing = await getReview(admin, id);
  if (!existing) throw new Error("Avaliação não encontrada.");

  const status = data.status ?? existing.status;
  const fields = buildMetaobjectFields({ ...data, status });
  await metaobjectUpdate(admin, id, fields);
  scheduleStorefrontStatsSync(admin);
  void emitReviewEvent({
    event: "review.updated",
    emittedAt: new Date().toISOString(),
    review: {
      id,
      status,
      placement: data.placement,
      productId: data.productId,
      rating: data.rating,
      author: data.author,
      title: data.title,
      body: data.body,
      verifiedBuyer: data.verified_buyer,
      imagesCount: data.imageFileIds?.length || 0,
    },
  });
  return id;
}

export async function deleteReview(
  admin: AdminApi,
  id: string,
  options?: { sync?: boolean },
) {
  const existing = await getReview(admin, id);
  const response = await admin.graphql(
    `#graphql
    mutation DeleteReview($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors { message }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const errors = json.data?.metaobjectDelete?.userErrors || [];
  if (errors.length) {
    throw new Error(errors.map((e: { message: string }) => e.message).join(". "));
  }
  if (options?.sync !== false) {
    invalidateReviewDedupeCache();
    scheduleStorefrontStatsSync(admin);
  }
  if (existing) {
    void emitReviewEvent({
      event: "review.deleted",
      emittedAt: new Date().toISOString(),
      review: {
        id: existing.id,
        status: existing.status,
        placement: existing.placement,
        productId: existing.productId,
        rating: existing.rating,
        author: existing.author,
        title: existing.title,
        body: existing.body,
        verifiedBuyer: existing.verified_buyer,
        imagesCount: existing.images.length,
      },
    });
  }
}

export async function deleteReviewsByIds(
  admin: AdminApi,
  ids: string[],
): Promise<{ processed: number; errors: string[] }> {
  let processed = 0;
  const errors: string[] = [];
  for (const id of ids) {
    try {
      await deleteReview(admin, id, { sync: false });
      processed++;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (processed > 0) {
    invalidateReviewDedupeCache();
    scheduleStorefrontStatsSync(admin);
  }
  return { processed, errors };
}

async function createMetaobject(admin: AdminApi, data: ReviewFormData) {
  const fields = buildMetaobjectFields(data);
  const response = await admin.graphql(
    `#graphql
    mutation CreateReview($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metaobject: {
          type: REVIEW_METAOBJECT_TYPE,
          capabilities: {
            publishable: { status: "ACTIVE" },
          },
          fields,
        },
      },
    },
  );
  const json = await response.json();
  const userErrors = json.data?.metaobjectCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: { message: string }) => e.message).join(", "));
  }
  const id = json.data?.metaobjectCreate?.metaobject?.id as string;
  scheduleStorefrontStatsSync(admin);
  void emitReviewEvent({
    event: "review.created",
    emittedAt: new Date().toISOString(),
    review: {
      id,
      status: data.status ?? "approved",
      placement: data.placement,
      productId: data.productId,
      rating: data.rating,
      author: data.author,
      title: data.title,
      body: data.body,
      verifiedBuyer: data.verified_buyer,
      imagesCount: data.imageFileIds?.length || 0,
    },
  });
  return id;
}

async function metaobjectUpdate(
  admin: AdminApi,
  id: string,
  fields: Array<{ key: string; value: string }>,
) {
  const response = await admin.graphql(
    `#graphql
    mutation UpdateReview($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    {
      variables: { id, metaobject: { fields } },
    },
  );
  const json = await response.json();
  const userErrors = json.data?.metaobjectUpdate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: { message: string }) => e.message).join(", "));
  }
}

async function updateMetaobjectStatus(
  admin: AdminApi,
  id: string,
  status: ReviewStatus,
  review: ReviewRecord,
) {
  const fields = buildMetaobjectFields({
    rating: review.rating,
    verified_buyer: review.verified_buyer,
    title: review.title,
    body: review.body,
    author: review.author,
    time: review.time,
    placement: review.placement,
    productId: review.productId,
    imageFileIds: review.images,
    status,
  });
  await metaobjectUpdate(admin, id, fields);
}

function buildMetaobjectFields(data: ReviewFormData) {
  const status = data.status ?? "approved";
  const fields: Array<{ key: string; value: string }> = [
    { key: "rating", value: String(data.rating) },
    { key: "verified_buyer", value: data.verified_buyer ? "true" : "false" },
    { key: "title", value: data.title || "" },
    { key: "body", value: data.body },
    { key: "author", value: data.author },
    { key: "time", value: data.time || "" },
    { key: "status", value: status },
    { key: "placement", value: data.placement },
    { key: "product_id", value: data.productId || "" },
    { key: "images", value: JSON.stringify(data.imageFileIds || []) },
  ];
  return fields;
}

export async function getFileImageUrls(
  admin: AdminApi,
  fileIds: string[],
): Promise<Record<string, string>> {
  const ids = fileIds.filter(Boolean).slice(0, 250);
  if (!ids.length) return {};

  const response = await admin.graphql(
    `#graphql
    query ReviewImageUrls($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on MediaImage {
          id
          image { url }
        }
        ... on GenericFile {
          id
          url
        }
      }
    }`,
    { variables: { ids } },
  );
  const json = await response.json();
  const out: Record<string, string> = {};
  for (const node of json.data?.nodes || []) {
    if (!node?.id) continue;
    const url = node.image?.url || node.url;
    if (url) out[node.id] = url;
  }
  return out;
}

export async function getReviewPlacement(
  admin: AdminApi,
  reviewId: string,
): Promise<{ placement: ReviewPlacement; productId?: string }> {
  const review = await getReview(admin, reviewId);
  if (review?.placement) {
    return { placement: review.placement, productId: review.productId };
  }
  return { placement: "homepage" };
}

export {
  buildProductSearchQuery,
  listStoreProducts,
  searchProducts,
} from "./product-search.server";
export { filterProductsByTerm, type StoreProductSearchRow } from "./product-search.shared";

export async function getProductDetails(admin: AdminApi, id: string) {
  const response = await admin.graphql(
    `#graphql
    query GetProductDetails($id: ID!) {
      product(id: $id) {
        id
        title
        description
        descriptionHtml
        productType
        tags
        vendor
        featuredMedia {
          preview {
            image { url altText }
          }
        }
        media(first: 8) {
          nodes {
            ... on MediaImage {
              image { url altText }
            }
          }
        }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const product = json.data?.product;
  if (!product) return null;

  const images: Array<{ url: string; altText: string }> = [];
  const seen = new Set<string>();

  const pushImage = (url?: string | null, altText?: string | null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, altText: altText || "" });
  };

  pushImage(
    product.featuredMedia?.preview?.image?.url,
    product.featuredMedia?.preview?.image?.altText,
  );

  for (const node of product.media?.nodes || []) {
    pushImage(node?.image?.url, node?.image?.altText);
  }

  return {
    id: product.id as string,
    title: product.title as string,
    description: (product.description as string) || stripHtml(product.descriptionHtml || ""),
    productType: (product.productType as string) || "",
    vendor: (product.vendor as string) || "",
    tags: (product.tags as string[]) || [],
    images,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
