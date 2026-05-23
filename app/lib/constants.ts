/** Metaobject type — mesmos field keys que product-reviews.liquid (modo metafield) */
export const REVIEW_METAOBJECT_TYPE = "review";

export const PRODUCT_REVIEWS_METAFIELD = {
  namespace: "custom",
  key: "reviews",
} as const;

export const SHOP_REVIEWS_METAFIELD = {
  namespace: "custom",
  key: "reviews",
} as const;

export const SHOP_TRUSTED_AVATARS_METAFIELD = {
  namespace: "custom",
  key: "reviews_trusted_avatars",
} as const;

export type ReviewPlacement = "homepage" | "product";

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
}
