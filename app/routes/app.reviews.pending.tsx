import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  EmptyState,
  BlockStack,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  approveReview,
  deleteReview,
  listPendingReviews,
  rejectReview,
} from "../lib/reviews.server";
import { ReviewStars } from "../components/ReviewStars";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const pending = await listPendingReviews(admin);
  return { pending };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = form.get("id") as string;

  if (!id) return redirect("/app/reviews/pending");

  if (intent === "approve") {
    await approveReview(admin, id);
  } else if (intent === "reject") {
    await rejectReview(admin, id);
  } else if (intent === "delete") {
    await deleteReview(admin, id);
  }

  return redirect("/app/reviews/pending");
};

function truncate(text: string, max: number) {
  if (!text) return "—";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

export default function PendingReviewsPage() {
  const { pending } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  return (
    <Page
      title="Aprovação pendente"
      subtitle={`${pending.length} aguardando moderação`}
      backAction={{ url: "/app/reviews" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Avaliações enviadas pelos clientes na loja só aparecem na vitrine depois
              de você clicar em <strong>Aprovar</strong>.
            </Banner>

            {pending.length === 0 ? (
              <EmptyState
                heading="Nenhuma avaliação pendente"
                action={{ content: "Ver todas", url: "/app/reviews" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Quando um cliente enviar uma avaliação pelo site, ela aparecerá aqui.</p>
              </EmptyState>
            ) : (
              <Card padding="0">
                <IndexTable
                  itemCount={pending.length}
                  headings={[
                    { title: "Cliente" },
                    { title: "Avaliação" },
                    { title: "Destino" },
                    { title: "Ações" },
                  ]}
                  selectable={false}
                >
                  {pending.map((r, i) => (
                    <IndexTable.Row id={r.id} key={r.id} position={i}>
                      <IndexTable.Cell>
                        <BlockStack gap="100">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {r.author}
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            <ReviewStars rating={r.rating} size={16} />
                            <Text as="span" variant="bodySm">
                              {r.rating}
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <BlockStack gap="100">
                          {r.title ? (
                            <Text as="span" variant="bodyMd" fontWeight="medium">
                              {truncate(r.title, 50)}
                            </Text>
                          ) : null}
                          <Text as="span" variant="bodySm" tone="subdued">
                            {truncate(r.body, 120)}
                          </Text>
                          {r.images.length > 0 ? (
                            <Badge tone="info">{r.images.length} foto(s)</Badge>
                          ) : null}
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone="attention">
                          {r.placement === "product" ? "Produto" : "Homepage"}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() =>
                              submit({ intent: "approve", id: r.id }, { method: "post" })
                            }
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="slim"
                            onClick={() =>
                              submit({ intent: "reject", id: r.id }, { method: "post" })
                            }
                          >
                            Rejeitar
                          </Button>
                          <Button
                            url={`/app/reviews/${encodeURIComponent(r.id)}`}
                            size="slim"
                          >
                            Editar
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
