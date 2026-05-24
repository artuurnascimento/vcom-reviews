import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { useCallback, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  TextField,
  Checkbox,
  Select,
  InlineGrid,
  Divider,
  Tabs,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getStorefrontSettings,
  parseStorefrontSettingsForm,
  saveStorefrontSettings,
  type StorefrontSettings,
} from "../lib/storefront-settings.server";
import { STOREFRONT_LAYOUTS } from "../lib/storefront-layouts";
import { buildThemeEditorDeepLink } from "../lib/theme-homepage.server";
import { ColorPickerField } from "../components/ColorPickerField";
import { RangeField } from "../components/RangeField";
import { LayoutPickerCard } from "../components/LayoutPickerCard";
import { StorefrontPreview } from "../components/StorefrontPreview";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await getStorefrontSettings(admin);
  const shopRes = await admin.graphql(`#graphql query { shop { name } }`);
  const shopJson = await shopRes.json();
  const shopName = shopJson.data?.shop?.name ?? "Sua loja";
  return {
    settings,
    shopName,
    themeDeepLink: buildThemeEditorDeepLink(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = parseStorefrontSettingsForm(form);
  return saveStorefrontSettings(admin, settings, session.shop);
};

const TABS = [
  { id: "layout", content: "Layout" },
  { id: "style", content: "Cores & estilo" },
  { id: "content", content: "Textos" },
  { id: "form", content: "Formulário" },
];

export default function AppearancePage() {
  const { settings: initial, shopName, themeDeepLink } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [settings, setSettings] = useState(initial);
  const [selectedTab, setSelectedTab] = useState(0);

  const set = useCallback(
    <K extends keyof StorefrontSettings>(key: K, value: StorefrontSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = () => {
    const form = document.getElementById("storefront-settings-form") as HTMLFormElement;
    if (form) submit(form, { method: "post" });
  };

  return (
    <Page
      title="Aparência da vitrine"
      subtitle="Editor visual com preview ao vivo — nada no Theme Editor"
      backAction={{ url: "/app" }}
      primaryAction={{ content: "Salvar alterações", onAction: handleSave }}
    >
      <Layout>
        <Layout.Section variant="oneHalf">
          <BlockStack gap="400">
            {actionData ? (
              actionData.ok ? (
                <BlockStack gap="300">
                  <Banner tone="success" title="Configurações salvas">
                    As alterações aparecem na loja em alguns segundos.
                  </Banner>
                  {actionData.themeSync?.updated ? (
                    <Banner tone="success" title="Homepage sincronizada">
                      templates/index.json atualizado automaticamente.
                    </Banner>
                  ) : null}
                  {actionData.themeSync && !actionData.themeSync.ok ? (
                    <Banner
                      tone="warning"
                      title="Sincronização do tema pendente"
                      action={{ content: "Abrir Theme Editor", url: themeDeepLink, target: "_blank" }}
                    >
                      {actionData.themeSync.accessDenied
                        ? "Reinstale o app para aceitar write_themes ou use o Theme Editor."
                        : actionData.themeSync.errors.join(" · ")}
                    </Banner>
                  ) : null}
                </BlockStack>
              ) : (
                <Banner tone="critical" title="Erro ao salvar">
                  {actionData.errors?.join(" · ")}
                </Banner>
              )
            ) : null}

            <Card padding="0">
              <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} fitted />
            </Card>

            <form id="storefront-settings-form" method="post">
              <input type="hidden" name="layout" value={settings.layout} />

              <BlockStack gap="400">
                {selectedTab === 0 ? (
                  <>
                    <Card>
                      <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h2" variant="headingMd">
                            Layout Trustpilot
                          </Text>
                          <Badge>{STOREFRONT_LAYOUTS.find((l) => l.id === settings.layout)?.name}</Badge>
                        </InlineStack>
                        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="300">
                          {STOREFRONT_LAYOUTS.map((layout) => (
                            <LayoutPickerCard
                              key={layout.id}
                              layoutId={layout.id}
                              selected={settings.layout === layout.id}
                              onSelect={() => set("layout", layout.id)}
                            />
                          ))}
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Fonte de dados
                        </Text>
                        <Select
                          label="Onde mostrar avaliações"
                          name="data_source"
                          options={[
                            { label: "Automático (home = shop, produto = product)", value: "auto" },
                            { label: "Página inicial", value: "homepage" },
                            { label: "Produto atual", value: "product" },
                          ]}
                          value={settings.data_source}
                          onChange={(v) => set("data_source", v as StorefrontSettings["data_source"])}
                        />
                      </BlockStack>
                    </Card>
                  </>
                ) : null}

                {selectedTab === 1 ? (
                  <>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Fundo & espaçamento
                        </Text>
                        <ColorPickerField
                          label="Fundo da seção"
                          name="background"
                          value={settings.background}
                          onChange={(v) => set("background", v)}
                        />
                        <RangeField
                          label="Espaço superior"
                          name="section_padding_top"
                          value={settings.section_padding_top}
                          min={0}
                          max={80}
                          onChange={(v) => set("section_padding_top", v)}
                        />
                        <RangeField
                          label="Espaço inferior"
                          name="section_padding_bottom"
                          value={settings.section_padding_bottom}
                          min={0}
                          max={80}
                          onChange={(v) => set("section_padding_bottom", v)}
                        />
                        <RangeField
                          label="Espaço lateral"
                          name="section_padding_sides"
                          value={settings.section_padding_sides}
                          min={0}
                          max={48}
                          onChange={(v) => set("section_padding_sides", v)}
                        />
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Paleta de cores
                        </Text>
                        <InlineGrid columns={2} gap="400">
                          <ColorPickerField label="Estrelas preenchidas" name="stars_color" value={settings.stars_color} onChange={(v) => set("stars_color", v)} />
                          <ColorPickerField label="Estrelas vazias" name="stars_empty_color" value={settings.stars_empty_color} onChange={(v) => set("stars_empty_color", v)} />
                          <ColorPickerField label="Ícone verified" name="verified_icon_color" value={settings.verified_icon_color} onChange={(v) => set("verified_icon_color", v)} />
                          <ColorPickerField label="Paginação ativa" name="pagination_active_color" value={settings.pagination_active_color} onChange={(v) => set("pagination_active_color", v)} />
                          <ColorPickerField label="Paginação inativa" name="pagination_inactive_color" value={settings.pagination_inactive_color} onChange={(v) => set("pagination_inactive_color", v)} />
                          <ColorPickerField label="Texto do rodapé" name="footer_text_color" value={settings.footer_text_color} onChange={(v) => set("footer_text_color", v)} />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Linha trusted by
                        </Text>
                        <Checkbox label="Mostrar linha" name="trusted_show_header" checked={settings.trusted_show_header} onChange={(v) => set("trusted_show_header", v)} />
                        <InlineGrid columns={2} gap="400">
                          <ColorPickerField label="Destaque" name="trusted_highlight_color" value={settings.trusted_highlight_color} onChange={(v) => set("trusted_highlight_color", v)} />
                          <ColorPickerField label="Texto" name="trusted_text_color" value={settings.trusted_text_color} onChange={(v) => set("trusted_text_color", v)} />
                          <ColorPickerField label="Ícone check" name="trusted_checkmark_color" value={settings.trusted_checkmark_color} onChange={(v) => set("trusted_checkmark_color", v)} />
                        </InlineGrid>
                        <RangeField label="Tamanho da fonte" name="trusted_font_size" value={settings.trusted_font_size} min={11} max={24} suffix="px" onChange={(v) => set("trusted_font_size", v)} />
                        <RangeField label="Margem abaixo" name="trusted_margin_bottom" value={settings.trusted_margin_bottom} min={0} max={48} onChange={(v) => set("trusted_margin_bottom", v)} />
                      </BlockStack>
                    </Card>
                  </>
                ) : null}

                {selectedTab === 2 ? (
                  <>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Trusted by & cards
                        </Text>
                        <TextField label="Texto após o nome da loja" name="trusted_text_after" value={settings.trusted_text_after} onChange={(v) => set("trusted_text_after", v)} autoComplete="off" />
                        <TextField label="Texto em destaque" name="trusted_text_highlight" value={settings.trusted_text_highlight} onChange={(v) => set("trusted_text_highlight", v)} autoComplete="off" />
                        <TextField label="Texto verified" name="verified_label" value={settings.verified_label} onChange={(v) => set("verified_label", v)} autoComplete="off" />
                        <InlineGrid columns={2} gap="400">
                          <TextField label="Máx. chars texto" name="reviews_text_max_chars" type="number" value={String(settings.reviews_text_max_chars)} onChange={(v) => set("reviews_text_max_chars", parseInt(v, 10) || 150)} autoComplete="off" />
                          <TextField label="Máx. chars título" name="reviews_title_max_chars" type="number" value={String(settings.reviews_title_max_chars)} onChange={(v) => set("reviews_title_max_chars", parseInt(v, 10) || 80)} autoComplete="off" />
                          <TextField label="Reviews por página" name="reviews_per_page" type="number" value={String(settings.reviews_per_page)} onChange={(v) => set("reviews_per_page", parseInt(v, 10) || 6)} autoComplete="off" />
                        </InlineGrid>
                        <Checkbox label="Mostrar Verified Buyer" name="show_verified" checked={settings.show_verified} onChange={(v) => set("show_verified", v)} />
                        <Checkbox label="Mostrar imagens" name="show_images" checked={settings.show_images} onChange={(v) => set("show_images", v)} />
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Rodapé
                        </Text>
                        <Checkbox label="Mostrar rodapé" name="footer_show" checked={settings.footer_show} onChange={(v) => set("footer_show", v)} />
                        <InlineGrid columns={2} gap="400">
                          <TextField label="Prefixo" name="footer_prefix" value={settings.footer_prefix} onChange={(v) => set("footer_prefix", v)} autoComplete="off" />
                          <TextField label="Meio" name="footer_middle" value={settings.footer_middle} onChange={(v) => set("footer_middle", v)} autoComplete="off" />
                          <TextField label="Sufixo" name="footer_suffix" value={settings.footer_suffix} onChange={(v) => set("footer_suffix", v)} autoComplete="off" />
                          <TextField label="Nota fallback" name="footer_rating" value={settings.footer_rating} onChange={(v) => set("footer_rating", v)} autoComplete="off" />
                          <TextField label="Total fallback" name="footer_total" value={settings.footer_total} onChange={(v) => set("footer_total", v)} autoComplete="off" />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h2" variant="headingMd">
                          Estado vazio
                        </Text>
                        <Checkbox label="Mostrar mensagem quando não há reviews" name="show_empty_message" checked={settings.show_empty_message} onChange={(v) => set("show_empty_message", v)} />
                        <TextField label="Texto" name="empty_message" value={settings.empty_message} onChange={(v) => set("empty_message", v)} autoComplete="off" multiline={2} />
                      </BlockStack>
                    </Card>
                  </>
                ) : null}

                {selectedTab === 3 ? (
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">
                        Formulário do cliente
                      </Text>
                      <Checkbox label="Mostrar botão de escrever avaliação" name="show_review_form" checked={settings.show_review_form} onChange={(v) => set("show_review_form", v)} />
                      <Checkbox label="Permitir upload de imagens" name="review_form_show_images" checked={settings.review_form_show_images} onChange={(v) => set("review_form_show_images", v)} />
                      <TextField label="Máx. imagens" name="review_form_images_max" type="number" value={String(settings.review_form_images_max)} onChange={(v) => set("review_form_images_max", parseInt(v, 10) || 5)} autoComplete="off" />
                      <TextField label="Mensagem após envio" name="review_form_success_message" value={settings.review_form_success_message} onChange={(v) => set("review_form_success_message", v)} autoComplete="off" />
                      <Divider />
                      <Text as="p" variant="bodySm" tone="subdued">
                        Labels opcionais — deixe vazio para usar a tradução padrão
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <TextField label="Botão escrever" name="review_form_btn_text" value={settings.review_form_btn_text} onChange={(v) => set("review_form_btn_text", v)} autoComplete="off" />
                        <TextField label="Label nota" name="review_form_rating_label" value={settings.review_form_rating_label} onChange={(v) => set("review_form_rating_label", v)} autoComplete="off" />
                        <TextField label="Label título" name="review_form_title_label" value={settings.review_form_title_label} onChange={(v) => set("review_form_title_label", v)} autoComplete="off" />
                        <TextField label="Placeholder título" name="review_form_title_placeholder" value={settings.review_form_title_placeholder} onChange={(v) => set("review_form_title_placeholder", v)} autoComplete="off" />
                        <TextField label="Label texto" name="review_form_body_label" value={settings.review_form_body_label} onChange={(v) => set("review_form_body_label", v)} autoComplete="off" />
                        <TextField label="Placeholder texto" name="review_form_body_placeholder" value={settings.review_form_body_placeholder} onChange={(v) => set("review_form_body_placeholder", v)} autoComplete="off" />
                        <TextField label="Label imagens" name="review_form_images_label" value={settings.review_form_images_label} onChange={(v) => set("review_form_images_label", v)} autoComplete="off" />
                        <TextField label="Botão imagens" name="review_form_images_btn_text" value={settings.review_form_images_btn_text} onChange={(v) => set("review_form_images_btn_text", v)} autoComplete="off" />
                        <TextField label="Label nome" name="review_form_author_label" value={settings.review_form_author_label} onChange={(v) => set("review_form_author_label", v)} autoComplete="off" />
                        <TextField label="Placeholder nome" name="review_form_author_placeholder" value={settings.review_form_author_placeholder} onChange={(v) => set("review_form_author_placeholder", v)} autoComplete="off" />
                        <TextField label="Botão enviar" name="review_form_submit_text" value={settings.review_form_submit_text} onChange={(v) => set("review_form_submit_text", v)} autoComplete="off" />
                        <TextField label="Botão cancelar" name="review_form_cancel_text" value={settings.review_form_cancel_text} onChange={(v) => set("review_form_cancel_text", v)} autoComplete="off" />
                      </InlineGrid>
                    </BlockStack>
                  </Card>
                ) : null}

                <Button variant="primary" submit fullWidth>
                  Salvar aparência
                </Button>
              </BlockStack>
            </form>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <div style={{ position: "sticky", top: 16 }}>
            <Card>
              <StorefrontPreview settings={settings} shopName={shopName} />
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
