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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { deleteReview, listReviews } from "../lib/reviews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const { reviews } = await listReviews(admin, { first: 250 });
  return { reviews };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = form.get("id") as string;
  if (intent === "delete" && id) {
    await deleteReview(admin, id);
  }
  return redirect("/app/reviews");
};

export default function ReviewsIndex() {
  const { reviews } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  return (
    <Page
      title="Avaliações"
      primaryAction={{ content: "Nova avaliação", url: "/app/reviews/new" }}
    >
      <Layout>
        <Layout.Section>
          {reviews.length === 0 ? (
            <EmptyState
              heading="Nenhuma avaliação"
              action={{ content: "Criar avaliação", url: "/app/reviews/new" }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Crie avaliações no app para exibir no bloco do tema.</p>
            </EmptyState>
          ) : (
            <Card padding="0">
              <IndexTable
                itemCount={reviews.length}
                headings={[
                  { title: "Autor" },
                  { title: "Título" },
                  { title: "Nota" },
                  { title: "Verified" },
                  { title: "Ações" },
                ]}
                selectable={false}
              >
                {reviews.map((r, i) => (
                  <IndexTable.Row id={r.id} key={r.id} position={i}>
                    <IndexTable.Cell>{r.author}</IndexTable.Cell>
                    <IndexTable.Cell>{r.title || "—"}</IndexTable.Cell>
                    <IndexTable.Cell>{r.rating}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {r.verified_buyer ? (
                        <Badge tone="success">Verified</Badge>
                      ) : (
                        "—"
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button url={`/app/reviews/${encodeURIComponent(r.id)}`}>
                          Editar
                        </Button>
                        <Button
                          tone="critical"
                          onClick={() =>
                            submit(
                              { intent: "delete", id: r.id },
                              { method: "post" },
                            )
                          }
                        >
                          Apagar
                        </Button>
                      </div>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
