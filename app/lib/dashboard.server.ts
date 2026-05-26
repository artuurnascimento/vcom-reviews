import { ratingToDistributionBucket } from "./ai-review-options";
import type { ReviewRecord } from "./constants";
import { REVIEW_METAOBJECT_TYPE } from "./constants";
import { listAllReviews, listPendingReviews } from "./reviews.server";

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
  const [reviews, infra, pending] = await Promise.all([
    listAllReviews(admin),
    fetchInfrastructure(admin),
    listPendingReviews(admin),
  ]);

  const approved = reviews.filter((r) => r.status === "approved");
  const homepagePublished = approved.filter((r) => r.placement === "homepage").length;
  const sum = approved.reduce((a, r) => a + r.rating, 0);
  const buckets: DashboardStats["ratingBuckets"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of approved) {
    buckets[ratingToDistributionBucket(r.rating)] += 1;
  }

  return {
    shopName: infra.shopName,
    setupReady: infra.setupReady,
    totalReviews: approved.length,
    homepagePublished,
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
    query DashboardInfra {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") { id }
      shop { name }
    }`,
  );
  const json = await response.json();

  return {
    shopName: json.data?.shop?.name || "Sua loja",
    setupReady: Boolean(json.data?.metaobjectDefinitionByType?.id),
  };
}
