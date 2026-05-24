import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
import { redirectWithEmbeddedSearch } from "../lib/embedded-app-path.server";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";
import { Banner, Page, Layout } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ReviewForm } from "../components/ReviewForm";
import { parseReviewFormData } from "../lib/parse-review-form.server";
import {
  getFileImageUrls,
  getReview,
  getReviewPlacement,
  searchProducts,
  updateReview,
} from "../lib/reviews.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = decodeURIComponent(params.id || "");
  const review = await getReview(admin, id);
  if (!review) throw new Response("Not found", { status: 404 });
  const products = await searchProducts(admin, "");
  const placementInfo = await getReviewPlacement(admin, id);
  const imageUrls = await getFileImageUrls(admin, review.images);
  return { review, products, imageUrls, placementInfo };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const id = decodeURIComponent(params.id || "");
  const form = await request.formData();
  try {
    const data = await parseReviewFormData(admin, form);
    if (!data.body || !data.author) {
      return { error: "Autor e texto são obrigatórios." };
    }
    await updateReview(admin, id, data);
    return redirectWithEmbeddedSearch(request, "/app/reviews");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar" };
  }
};

export default function EditReview() {
  const paths = useAppPaths();
  const { review, products, imageUrls, placementInfo } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useEmbeddedSubmit();

  return (
    <Page title="Editar avaliação" backAction={{ url: paths.reviews }}>
      <Layout>
        {actionData && "error" in actionData ? (
          <Layout.Section>
            <Banner tone="critical">{actionData.error}</Banner>
          </Layout.Section>
        ) : null}
        <Layout.Section>
          <ReviewForm
            products={products}
            imageUrls={imageUrls}
            initial={{
              rating: review.rating,
              verified_buyer: review.verified_buyer,
              title: review.title,
              body: review.body,
              author: review.author,
              time: review.time,
              placement: placementInfo.placement,
              productId: placementInfo.productId,
              imageFileIds: review.images,
            }}
            submitLabel="Atualizar"
            onSubmit={(data, files) => {
              const fd = new FormData();
              fd.set("rating", String(data.rating));
              fd.set("verified_buyer", String(data.verified_buyer));
              fd.set("title", data.title);
              fd.set("body", data.body);
              fd.set("author", data.author);
              fd.set("time", data.time);
              fd.set("placement", data.placement);
              if (data.productId) fd.set("productId", data.productId);
              fd.set("existing_images", JSON.stringify(data.imageFileIds || []));
              files.forEach((file) => fd.append("images", file));
              submit(fd, { method: "post", encType: "multipart/form-data" });
            }}
            onCancel={() => {
              window.location.assign(paths.reviews);
            }}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
