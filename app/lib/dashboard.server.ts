import type { ReviewRecord } from "./constants";
import { REVIEW_METAOBJECT_TYPE, SHOP_REVIEWS_METAFIELD } from "./constants";
import { listReviews } from "./reviews.server";

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
};

export async function getDashboardStats(admin: AdminApi): Promise<DashboardStats> {
  const [{ reviews }, infra] = await Promise.all([
    listReviews(admin, { first: 250 }),
    fetchInfrastructure(admin),
  ]);

  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const buckets: DashboardStats["ratingBuckets"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const bucket = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
    buckets[bucket] += 1;
  }

  return {
    shopName: infra.shopName,
    setupReady: infra.setupReady,
    totalReviews: reviews.length,
    homepagePublished: infra.homepageCount,
    averageRating: reviews.length ? (sum / reviews.length).toFixed(1) : "—",
    verifiedCount: reviews.filter((r) => r.verified_buyer).length,
    withImagesCount: reviews.filter((r) => r.images.length > 0).length,
    ratingBuckets: buckets,
    recentReviews: reviews.slice(0, 5),
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
