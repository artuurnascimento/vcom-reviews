import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, Banner, Button } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ensureReviewInfrastructure } from "../lib/metaobject-setup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const result = await ensureReviewInfrastructure(admin);
  return result;
};

export default function SetupPage() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  return (
    <Page title="Configuração">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p">
                Cria o metaobject <code>review</code> (campos: rating, verified_buyer,
                title, body, author, time, images) e os metafields{" "}
                <code>custom.reviews</code> em Shop e Product.
              </Text>
              <Button
                variant="primary"
                onClick={() => submit({}, { method: "post" })}
              >
                Executar configuração
              </Button>
              {actionData ? (
                actionData.ok ? (
                  <Banner tone="success">Configuração concluída.</Banner>
                ) : (
                  <Banner tone="critical">{actionData.errors.join(" · ")}</Banner>
                )
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
