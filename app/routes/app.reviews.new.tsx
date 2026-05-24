import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
import { redirectWithEmbeddedSearch } from "../lib/embedded-app-path.server";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";
import { Banner, Page, Layout } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ReviewForm } from "../components/ReviewForm";
import { parseReviewFormData } from "../lib/parse-review-form.server";
import { createReview, searchProducts } from "../lib/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const products = await searchProducts(admin, "");
  return { products };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  try {
    const data = await parseReviewFormData(admin, form);
    if (!data.body || !data.author) {
      return { error: "Autor e texto são obrigatórios." };
    }
    if (data.placement === "product" && !data.productId) {
      return { error: "Selecione um produto." };
    }
    await createReview(admin, data);
    return redirectWithEmbeddedSearch(request, "/app/reviews");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar";
    if (msg.includes("metaobject definition")) {
      return {
        error:
          "O tipo review ainda não existe na loja. Abra Configuração → Executar configuração e tente novamente.",
      };
    }
    return { error: msg };
  }
};

export default function NewReview() {
  const paths = useAppPaths();
  const { products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useEmbeddedSubmit();

  return (
    <Page title="Nova avaliação" backAction={{ url: paths.reviews }}>
      <Layout>
        {actionData && "error" in actionData ? (
          <Layout.Section>
            <Banner tone="critical">{actionData.error}</Banner>
          </Layout.Section>
        ) : null}
        <Layout.Section>
          <ReviewForm
            products={products}
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
