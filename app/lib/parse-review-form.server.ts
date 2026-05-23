import type { ReviewFormData } from "./constants";
import { resolveImageIdsFromForm } from "./upload.server";

type AdminApi = Parameters<typeof resolveImageIdsFromForm>[0];

export async function parseReviewFormData(
  admin: AdminApi,
  form: FormData,
): Promise<ReviewFormData> {
  const placement =
    (form.get("placement") as ReviewFormData["placement"]) || "homepage";
  const productId = String(form.get("productId") || "") || undefined;
  const imageFileIds = await resolveImageIdsFromForm(admin, form);

  return {
    rating: parseFloat(String(form.get("rating") || "5")),
    verified_buyer: form.get("verified_buyer") === "true",
    title: String(form.get("title") || ""),
    body: String(form.get("body") || "").trim(),
    author: String(form.get("author") || "").trim(),
    time: String(form.get("time") || ""),
    placement,
    productId: placement === "product" ? productId : undefined,
    imageFileIds,
  };
}
