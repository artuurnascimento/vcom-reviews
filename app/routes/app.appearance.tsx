import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { useState } from "react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getStorefrontSettings,
  parseStorefrontSettingsForm,
  saveStorefrontSettings,
  type StorefrontSettings,
} from "../lib/storefront-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return getStorefrontSettings(admin);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = parseStorefrontSettingsForm(form);
  return saveStorefrontSettings(admin, settings);
};

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: keyof StorefrontSettings;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label={label}
      name={name}
      value={value}
      onChange={onChange}
      autoComplete="off"
      helpText="Hex, ex: #1d8a42"
    />
  );
}

export default function AppearancePage() {
  const initial = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [settings, setSettings] = useState(initial);

  const set = <K extends keyof StorefrontSettings>(key: K, value: StorefrontSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Page
      title="Aparência da vitrine"
      subtitle="Cores, textos e layout — configurado no app, não no Theme Editor"
      backAction={{ url: "/app" }}
      primaryAction={{
        content: "Salvar",
        onAction: () => {
          const form = document.getElementById("storefront-settings-form") as HTMLFormElement;
          if (form) submit(form, { method: "post" });
        },
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {actionData ? (
              actionData.ok ? (
                <Banner tone="success" title="Configurações salvas">
                  As alterações aparecem na loja em alguns segundos.
                </Banner>
              ) : (
                <Banner tone="critical" title="Erro ao salvar">
                  {actionData.errors?.join(" · ")}
                </Banner>
              )
            ) : null}

            <Banner tone="info">
              <p>
                No Theme Editor basta adicionar o bloco <strong>Avaliações VCOM</strong>. Todas
                as opções visuais ficam aqui.
              </p>
            </Banner>

            <form id="storefront-settings-form" method="post">
              <BlockStack gap="500">
                <Card>
                  <BlockStack gap="400">
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

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Fundo e espaçamento
                    </Text>
                    <InlineGrid columns={2} gap="400">
                      <ColorField label="Fundo da seção" name="background" value={settings.background} onChange={(v) => set("background", v)} />
                      <TextField label="Espaço superior (px)" name="section_padding_top" type="number" value={String(settings.section_padding_top)} onChange={(v) => set("section_padding_top", parseInt(v, 10) || 0)} autoComplete="off" />
                      <TextField label="Espaço inferior (px)" name="section_padding_bottom" type="number" value={String(settings.section_padding_bottom)} onChange={(v) => set("section_padding_bottom", parseInt(v, 10) || 0)} autoComplete="off" />
                      <TextField label="Espaço lateral (px)" name="section_padding_sides" type="number" value={String(settings.section_padding_sides)} onChange={(v) => set("section_padding_sides", parseInt(v, 10) || 0)} autoComplete="off" />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Linha trusted by
                    </Text>
                    <Checkbox label="Mostrar linha" name="trusted_show_header" checked={settings.trusted_show_header} onChange={(v) => set("trusted_show_header", v)} />
                    <TextField label="Texto após o nome da loja" name="trusted_text_after" value={settings.trusted_text_after} onChange={(v) => set("trusted_text_after", v)} autoComplete="off" />
                    <TextField label="Texto em destaque" name="trusted_text_highlight" value={settings.trusted_text_highlight} onChange={(v) => set("trusted_text_highlight", v)} autoComplete="off" />
                    <InlineGrid columns={2} gap="400">
                      <ColorField label="Cor destaque" name="trusted_highlight_color" value={settings.trusted_highlight_color} onChange={(v) => set("trusted_highlight_color", v)} />
                      <ColorField label="Cor texto" name="trusted_text_color" value={settings.trusted_text_color} onChange={(v) => set("trusted_text_color", v)} />
                      <ColorField label="Cor ícone" name="trusted_checkmark_color" value={settings.trusted_checkmark_color} onChange={(v) => set("trusted_checkmark_color", v)} />
                      <TextField label="Fonte (px)" name="trusted_font_size" type="number" value={String(settings.trusted_font_size)} onChange={(v) => set("trusted_font_size", parseInt(v, 10) || 15)} autoComplete="off" />
                      <TextField label="Margem abaixo (px)" name="trusted_margin_bottom" type="number" value={String(settings.trusted_margin_bottom)} onChange={(v) => set("trusted_margin_bottom", parseInt(v, 10) || 0)} autoComplete="off" />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Cards
                    </Text>
                    <InlineGrid columns={2} gap="400">
                      <ColorField label="Cor estrelas" name="stars_color" value={settings.stars_color} onChange={(v) => set("stars_color", v)} />
                      <ColorField label="Estrelas vazias" name="stars_empty_color" value={settings.stars_empty_color} onChange={(v) => set("stars_empty_color", v)} />
                      <ColorField label="Cor verified" name="verified_icon_color" value={settings.verified_icon_color} onChange={(v) => set("verified_icon_color", v)} />
                      <TextField label="Texto verified" name="verified_label" value={settings.verified_label} onChange={(v) => set("verified_label", v)} autoComplete="off" />
                      <TextField label="Máx. chars texto" name="reviews_text_max_chars" type="number" value={String(settings.reviews_text_max_chars)} onChange={(v) => set("reviews_text_max_chars", parseInt(v, 10) || 150)} autoComplete="off" />
                      <TextField label="Máx. chars título" name="reviews_title_max_chars" type="number" value={String(settings.reviews_title_max_chars)} onChange={(v) => set("reviews_title_max_chars", parseInt(v, 10) || 80)} autoComplete="off" />
                      <TextField label="Por página" name="reviews_per_page" type="number" value={String(settings.reviews_per_page)} onChange={(v) => set("reviews_per_page", parseInt(v, 10) || 6)} autoComplete="off" />
                      <ColorField label="Paginação ativa" name="pagination_active_color" value={settings.pagination_active_color} onChange={(v) => set("pagination_active_color", v)} />
                      <ColorField label="Paginação inativa" name="pagination_inactive_color" value={settings.pagination_inactive_color} onChange={(v) => set("pagination_inactive_color", v)} />
                    </InlineGrid>
                    <Checkbox label="Verified Buyer" name="show_verified" checked={settings.show_verified} onChange={(v) => set("show_verified", v)} />
                    <Checkbox label="Imagens" name="show_images" checked={settings.show_images} onChange={(v) => set("show_images", v)} />
                    <Checkbox label="Mensagem vazio" name="show_empty_message" checked={settings.show_empty_message} onChange={(v) => set("show_empty_message", v)} />
                    <TextField label="Texto vazio" name="empty_message" value={settings.empty_message} onChange={(v) => set("empty_message", v)} autoComplete="off" />
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
                      <TextField label="Nota fallback" name="footer_rating" value={settings.footer_rating} onChange={(v) => set("footer_rating", v)} autoComplete="off" />
                      <TextField label="Meio" name="footer_middle" value={settings.footer_middle} onChange={(v) => set("footer_middle", v)} autoComplete="off" />
                      <TextField label="Total fallback" name="footer_total" value={settings.footer_total} onChange={(v) => set("footer_total", v)} autoComplete="off" />
                      <TextField label="Sufixo" name="footer_suffix" value={settings.footer_suffix} onChange={(v) => set("footer_suffix", v)} autoComplete="off" />
                      <ColorField label="Cor texto" name="footer_text_color" value={settings.footer_text_color} onChange={(v) => set("footer_text_color", v)} />
                    </InlineGrid>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Formulário do cliente
                    </Text>
                    <Checkbox label="Mostrar formulário" name="show_review_form" checked={settings.show_review_form} onChange={(v) => set("show_review_form", v)} />
                    <Checkbox label="Upload de imagens" name="review_form_show_images" checked={settings.review_form_show_images} onChange={(v) => set("review_form_show_images", v)} />
                    <TextField label="Máx. imagens" name="review_form_images_max" type="number" value={String(settings.review_form_images_max)} onChange={(v) => set("review_form_images_max", parseInt(v, 10) || 5)} autoComplete="off" />
                    <TextField label="Mensagem após envio" name="review_form_success_message" value={settings.review_form_success_message} onChange={(v) => set("review_form_success_message", v)} autoComplete="off" />
                    <Divider />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Labels opcionais (vazio = tradução padrão)
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

                <Button variant="primary" submit>
                  Salvar aparência
                </Button>
              </BlockStack>
            </form>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
