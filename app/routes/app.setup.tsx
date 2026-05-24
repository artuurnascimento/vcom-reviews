import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
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
  getInfrastructureStatus,
  runAutomaticInfrastructureSetup,
} from "../lib/metaobject-setup.server";
import { buildThemeEditorDeepLink } from "../lib/theme-homepage.server";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let status = await getInfrastructureStatus(admin);
  let autoSetup: Awaited<ReturnType<typeof runAutomaticInfrastructureSetup>> | null = null;

  if (!status.allReady) {
    autoSetup = await runAutomaticInfrastructureSetup(admin, session.shop);
    status = await getInfrastructureStatus(admin);
  }

  return {
    ...status,
    themeDeepLink: buildThemeEditorDeepLink(session.shop),
    autoSetup,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const result = await runAutomaticInfrastructureSetup(admin, session.shop);
  return {
    ok: result.ok && result.themeOk,
    errors: [...result.errors, ...result.themeErrors],
    theme: result.theme,
  };
};

export default function SetupPage() {
  const paths = useAppPaths();
  const { items, themeDeepLink, themeStatus, autoSetup } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useEmbeddedSubmit();
  const justRan = actionData !== undefined;
  const success = actionData?.ok === true;
  const autoRanOk = autoSetup != null && autoSetup.themeOk && items.every((i) => i.ready);
  const autoRanFailed =
    autoSetup != null && (!autoSetup.themeOk || !items.every((i) => i.ready));

  return (
    <Page
      title="Configuração"
      subtitle="Infraestrutura de dados na sua loja Shopify"
      backAction={{ url: paths.app }}
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

            {autoRanOk && items.every((i) => i.ready) ? (
              <Banner tone="success" title="Configuração automática concluída">
                Metaobject e bloco na homepage foram sincronizados ao abrir esta página.
                {autoSetup?.theme?.updated
                  ? " O arquivo templates/index.json foi atualizado."
                  : null}
              </Banner>
            ) : null}

            {autoRanFailed ? (
              <Banner
                tone="warning"
                title="Configuração automática incompleta"
                action={{ content: "Abrir Theme Editor", url: themeDeepLink, target: "_blank" }}
              >
                {[...autoSetup.errors, ...autoSetup.themeErrors].filter(Boolean).join(" · ")}
                {autoSetup.theme.accessDenied
                  ? " Reinstale o app para aceitar o escopo write_themes."
                  : ""}
              </Banner>
            ) : null}

            {!items.every((i) => i.ready) && !justRan && !autoRanFailed ? (
              <Banner
                tone="warning"
                title="Ação necessária"
                action={{ content: "Abrir Theme Editor", url: themeDeepLink, target: "_blank" }}
              >
                Se o bloco da homepage não sincronizar via API, use o Theme Editor ou o botão
                abaixo.
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
                  variant={items.every((i) => i.ready) ? "secondary" : "primary"}
                  onClick={() => submit({}, { method: "post" })}
                >
                  {items.every((i) => i.ready)
                    ? "Reexecutar configuração"
                    : "Tentar novamente manualmente"}
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
                  O app sincroniza templates/index.json automaticamente ao instalar, ao abrir
                  qualquer página do painel e ao salvar Aparência. O botão acima só é
                  necessário se a API do tema falhar.
                </Text>
                <Button url={themeDeepLink} target="_blank">
                  Abrir Theme Editor
                </Button>
                <Box>
                  <InlineStack gap="200">
                    <Button url={paths.reviewsNew} variant="primary">
                      Nova avaliação
                    </Button>
                    <Button url={paths.app}>Voltar ao painel</Button>
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
