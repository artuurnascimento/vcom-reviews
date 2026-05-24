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
import { ensureHomepageReviewsThemeBlock, buildThemeEditorDeepLink } from "../lib/theme-homepage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const status = await getInfrastructureStatus(admin);
  return { ...status, themeDeepLink: buildThemeEditorDeepLink(session.shop) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const infra = await ensureReviewInfrastructure(admin);
  const theme = await ensureHomepageReviewsThemeBlock(admin, session.shop);
  return {
    ok: infra.ok && theme.ok,
    errors: [...infra.errors, ...theme.errors],
    theme,
  };
};

export default function SetupPage() {
  const { items, themeDeepLink, themeStatus } = useLoaderData<typeof loader>();
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
                <BlockStack gap="300">
                  <Banner tone="success" title="Configuração concluída">
                    Metaobject e homepage sincronizados.
                  </Banner>
                  {actionData?.theme?.updated ? (
                    <Banner tone="success" title="index.json atualizado">
                      templates/index.json publicado com bloco Avaliações VCOM (settings
                      vazios).
                    </Banner>
                  ) : null}
                </BlockStack>
              ) : (
                <Banner tone="critical" title="Erros na configuração">
                  {actionData?.errors?.join(" · ")}
                  {actionData?.theme?.accessDenied ? (
                    <>
                      {" "}
                      Reinstale o app para aceitar write_themes ou abra o Theme Editor.
                    </>
                  ) : null}
                </Banner>
              )
            ) : null}

            {!items.every((i) => i.ready) && !justRan ? (
              <Banner
                tone="warning"
                title="Ação necessária"
                action={{ content: "Abrir Theme Editor", url: themeDeepLink, target: "_blank" }}
              >
                A configuração roda automaticamente na instalação. Se o bloco da homepage
                não sincronizar via API, use o botão abaixo ou reexecute a configuração.
                {themeStatus.errors.length ? ` (${themeStatus.errors[0]})` : ""}
              </Banner>
            ) : null}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Status da infraestrutura
                </Text>
                <BlockStack gap="300">
                  {items.map((item) => (
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
                  {items.every((i) => i.ready) ? "Reexecutar configuração" : "Executar configuração"}
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
                  O app sincroniza automaticamente templates/index.json na instalação e ao
                  salvar Aparência (bloco com settings vazios). Se a API do tema falhar,
                  abra o Theme Editor pelo link acima.
                </Text>
                <Button url={themeDeepLink} target="_blank">
                  Abrir Theme Editor
                </Button>
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
