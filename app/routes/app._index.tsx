import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, Button } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { listReviews } from "../lib/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { reviews } = await listReviews(admin, { first: 250 });
  const sum = reviews.reduce((a, r) => a + r.rating, 0);
  const avg = reviews.length ? (sum / reviews.length).toFixed(1) : "—";
  return { count: reviews.length, avg };
};

export default function AppHome() {
  const { count, avg } = useLoaderData<typeof loader>();
  return (
    <Page title="VCOM Reviews">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyLg">
                Gerencie avaliações manuais com o mesmo modelo do tema VCOM (
                <code>custom.reviews</code> / metaobject <code>review</code>).
              </Text>
              <Text as="p">
                Total: <strong>{count}</strong> · Média: <strong>{avg}</strong>
              </Text>
              <Button url="/app/reviews" variant="primary">
                Ver avaliações
              </Button>
              <Button url="/app/setup">Executar configuração da loja</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
