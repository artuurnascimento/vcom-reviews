import type { ReviewRecord } from "./constants";
import { REVIEW_METAOBJECT_TYPE, SHOP_REVIEWS_METAFIELD } from "./constants";
import { listPendingReviews, listReviews } from "./reviews.server";

type AdminApi = Parameters<typeof listReviews>[0];

export type DashboardStats = {
  shopName: string;
  setupReady: boolean;
  totalReviews: number;
  homepagePublished: number;
  averageRating: string;
  verifiedCount: number;
  withImagesCount: number;
  ratingBuckets: Record<1 | 2 | 3 | 4 | 5, number>;
  recentReviews: ReviewRecord[];
  pendingCount: number;
};

export async function getDashboardStats(admin: AdminApi): Promise<DashboardStats> {
  const [{ reviews }, infra, pending] = await Promise.all([
    listReviews(admin, { first: 250 }),
    fetchInfrastructure(admin),
    listPendingReviews(admin),
  ]);

  const approved = reviews.filter((r) => r.status === "approved");
  const sum = approved.reduce((a, r) => a + r.rating, 0);
  const buckets: DashboardStats["ratingBuckets"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of approved) {
    const bucket = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    buckets[bucket] += 1;
  }

  return {
    shopName: infra.shopName,
    setupReady: infra.setupReady,
    totalReviews: approved.length,
    homepagePublished: infra.homepageCount,
    averageRating: approved.length ? (sum / approved.length).toFixed(1) : "—",
    verifiedCount: approved.filter((r) => r.verified_buyer).length,
    withImagesCount: approved.filter((r) => r.images.length > 0).length,
    ratingBuckets: buckets,
    recentReviews: reviews.slice(0, 5),
    pendingCount: pending.length,
  };
}

async function fetchInfrastructure(admin: AdminApi) {
  const response = await admin.graphql(
    `#graphql
    query DashboardInfra($namespace: String!, $key: String!) {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") { id }
      shop {
        name
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    {
      variables: {
        namespace: SHOP_REVIEWS_METAFIELD.namespace,
        key: SHOP_REVIEWS_METAFIELD.key,
      },
    },
  );
  const json = await response.json();
  let homepageCount = 0;
  const raw = json.data?.shop?.metafield?.value;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      homepageCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      homepageCount = 0;
    }
  }

  return {
    shopName: json.data?.shop?.name || "Sua loja",
    setupReady: Boolean(json.data?.metaobjectDefinitionByType?.id),
    homepageCount,
  };
}
