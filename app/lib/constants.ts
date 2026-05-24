/** Merchant-owned — legível na vitrine via shop.metaobjects.review */
export const REVIEW_METAOBJECT_TYPE = "review";
/** Legado app-owned (migrado automaticamente para review) */
export const LEGACY_REVIEW_METAOBJECT_TYPE = "$app:review";

export type ReviewPlacement = "homepage" | "product";
export type ReviewStatus = "approved" | "pending" | "rejected";

export interface ReviewFormData {
  rating: number;
  verified_buyer: boolean;
  title: string;
  body: string;
  author: string;
  time: string;
  placement: ReviewPlacement;
  productId?: string;
  imageFileIds?: string[];
  status?: ReviewStatus;
}

export interface ReviewRecord {
  id: string;
  handle: string;
  rating: number;
  verified_buyer: boolean;
  title: string;
  body: string;
  author: string;
  time: string;
  images: string[];
  status: ReviewStatus;
  placement: ReviewPlacement;
  productId?: string;
}

export function isReviewPublished(record: ReviewRecord): boolean {
  return record.status === "approved";
}
