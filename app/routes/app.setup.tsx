import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  InlineStack,
  Badge,
  Divider,
  List,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  ensureReviewInfrastructure,
  getInfrastructureStatus,
} from "../lib/metaobject-setup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return getInfrastructureStatus(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const result = await ensureReviewInfrastructure(admin);
  return result;
};

export default function SetupPage() {
  const status = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const justRan = actionData !== undefined;
  const success = actionData?.ok === true;

  return (
    <Page
      title="Configuração"
      subtitle="Infraestrutura de dados na sua loja Shopify"
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {justRan ? (
              success ? (
                <Banner tone="success" title="Configuração concluída">
                  Metaobject e metafields prontos para uso.
                </Banner>
              ) : (
                <Banner tone="critical" title="Erros na configuração">
                  {actionData?.errors?.join(" · ")}
                </Banner>
              )
            ) : null}

            {!status.allReady && !justRan ? (
              <Banner tone="warning" title="Ação necessária">
                A configuração roda automaticamente na instalação. Se algo falhou,
                use o botão abaixo para reexecutar.
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Status da infraestrutura
                </Text>
                <BlockStack gap="300">
                  {status.items.map((item) => (
                    <InlineStack key={item.id} align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {item.label}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {item.description}
                        </Text>
                      </BlockStack>
                      <Badge tone={item.ready ? "success" : "warning"}>
                        {item.ready ? "Ativo" : "Pendente"}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
                <Divider />
                <Button
                  variant="primary"
                  onClick={() => submit({}, { method: "post" })}
                  loading={false}
                >
                  {status.allReady ? "Reexecutar configuração" : "Executar configuração"}
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  O que será criado
                </Text>
                <List type="bullet">
                  <List.Item>
                    Metaobject <strong>review</strong> — única fonte de dados (rating,
                    status, placement, product_id, imagens, etc.)
                  </List.Item>
                  <List.Item>
                    Vitrine lê <strong>shop.metaobjects.review</strong> — sem metafields
                  </List.Item>
                  <List.Item>
                    Aprovação altera o campo <strong>status</strong> no metaobject
                  </List.Item>
                </List>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Próximo passo
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Após a configuração, crie avaliações e adicione o bloco{" "}
                  <strong>Avaliações VCOM</strong> no Theme Editor.
                </Text>
                <Box>
                  <InlineStack gap="200">
                    <Button url="/app/reviews/new" variant="primary">
                      Nova avaliação
                    </Button>
                    <Button url="/app">Voltar ao painel</Button>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
