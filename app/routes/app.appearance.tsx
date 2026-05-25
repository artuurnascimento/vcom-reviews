import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useActionData, useLoaderData, useRouteError } from "@remix-run/react";
import { useEmbeddedSubmit } from "../hooks/useEmbeddedAppPath";
import { useCallback, useState } from "react";
import {
  Page,
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
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getStorefrontSettings,
  parseStorefrontSettingsJson,
  saveStorefrontSettings,
} from "../lib/storefront-settings.server";
import { ensureFooterTrustpilotPublished } from "../lib/theme-footer-sync.server";
import { buildFooterEmbedActivateUrl } from "../lib/theme-footer-embed.server";
import {
  coerceStorefrontSettings,
  type StorefrontSettings,
} from "../lib/storefront-settings.shared";
import { STOREFRONT_LAYOUTS } from "../lib/storefront-layouts";
import { buildThemeEditorDeepLink } from "../lib/theme-homepage.server";
import { ColorPickerField } from "../components/ColorPickerField";
import { RangeField } from "../components/RangeField";
import { LayoutPickerCard } from "../components/LayoutPickerCard";
import { StorefrontPreview } from "../components/StorefrontPreview";
import { useAppPaths } from "../hooks/useEmbeddedAppPath";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const raw = await getStorefrontSettings(admin);
    const settings = coerceStorefrontSettings(raw);
    const shopRes = await admin.graphql(
      `#graphql
      query AppearanceShop {
        shop {
          name
        }
      }`,
    );
    const shopJson = await shopRes.json();
    const shopName = shopJson.data?.shop?.name ?? "Sua loja";
    const footerPublish = settings.footer_trustpilot_show
      ? await ensureFooterTrustpilotPublished(admin, session.shop, true)
      : null;
    return {
      settings,
      shopName,
      themeDeepLink: buildThemeEditorDeepLink(session.shop),
      footerPublish,
      footerEmbedActivateUrl: buildFooterEmbedActivateUrl(session.shop),
    };
  } catch (error) {
    console.error("[vcom-reviews] appearance loader", error);
    return {
      settings: coerceStorefrontSettings(null),
      shopName: "Sua loja",
      themeDeepLink: buildThemeEditorDeepLink(session.shop),
      loaderError: error instanceof Error ? error.message : "Erro ao carregar configurações",
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "sync_footer_theme") {
    const footerPublish = await ensureFooterTrustpilotPublished(admin, session.shop, true);
    return {
      ok: footerPublish.ok,
      errors: footerPublish.ok ? [] : footerPublish.errors,
      footerPublish,
      syncOnly: true,
    };
  }

  const raw = form.get("settings_json");
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, errors: ["Nenhuma configuração recebida. Tente salvar novamente."] };
  }
  try {
    const settings = parseStorefrontSettingsJson(raw);
    return saveStorefrontSettings(admin, settings, session.shop);
  } catch {
    return { ok: false, errors: ["Formato de configurações inválido. Recarregue a página e tente de novo."] };
  }
};

const TABS = [
  { id: "layout", content: "Layout" },
  { id: "style", content: "Cores & estilo" },
  { id: "content", content: "Textos" },
  { id: "form", content: "Formulário" },
];

export function ErrorBoundary() {
  const paths = useAppPaths();
  const error = useRouteError();
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Erro desconhecido na página de aparência";

  return (
    <Page title="Aparência da vitrine" backAction={{ url: paths.app }}>
      <Banner tone="critical" title="Não foi possível abrir o editor">
        <p>{message}</p>
      </Banner>
      <Box paddingBlockStart="400">
        <Button url={paths.app}>Voltar ao painel</Button>
      </Box>
    </Page>
  );
}

export default function AppearancePage() {
  const paths = useAppPaths();
  const loaderData = useLoaderData<typeof loader>();
  const {
    shopName,
    themeDeepLink,
    loaderError,
    footerPublish: loaderFooterPublish,
    footerEmbedActivateUrl,
  } = loaderData;
  const actionData = useActionData<typeof action>();
  const submit = useEmbeddedSubmit();
  const [settings, setSettings] = useState(() =>
    coerceStorefrontSettings(loaderData.settings),
  );
  const [selectedTab, setSelectedTab] = useState(0);

  const layoutLabel =
    STOREFRONT_LAYOUTS.find((l) => l.id === settings.layout)?.name ?? "Layout";

  const set = useCallback(
    <K extends keyof StorefrontSettings>(key: K, value: StorefrontSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("settings_json", JSON.stringify(settings));
    submit(fd, { method: "post" });
  }, [settings, submit]);

  const handleSyncFooterTheme = useCallback(() => {
    const fd = new FormData();
    fd.set("intent", "sync_footer_theme");
    submit(fd, { method: "post" });
  }, [submit]);

  return (
    <Page
      title="Aparência da vitrine"
      subtitle="Editor visual com preview ao vivo"
      backAction={{ url: paths.app }}
      primaryAction={{ content: "Salvar alterações", onAction: handleSave }}
    >
      <BlockStack gap="400">
        {loaderError ? (
          <Banner tone="warning" title="Configurações parciais">
            {loaderError} — usando valores padrão até salvar novamente.
          </Banner>
        ) : null}

        {loaderFooterPublish && !loaderFooterPublish.ok ? (
          <Banner
            tone="critical"
            title="Trustpilot no rodapé — ative no tema"
            action={{
              content: "Ativar no Theme Editor",
              url: footerEmbedActivateUrl,
              external: true,
            }}
          >
            {loaderFooterPublish.errors.join(" · ")}
          </Banner>
        ) : loaderFooterPublish?.published || loaderFooterPublish?.appEmbed.alreadyActive ? (
          <Banner tone="success" title="Trustpilot publicado no tema">
            App embed e arquivos do tema atualizados. Atualize a loja (F5).
          </Banner>
        ) : loaderFooterPublish && settings.footer_trustpilot_show ? (
          <Banner
            tone="warning"
            title="Ative o embed do app no tema"
            action={{
              content: "Ativar agora",
              url: footerEmbedActivateUrl,
              external: true,
            }}
          >
            Clique em Ativar agora e confirme Trustpilot no rodapé em App embeds, depois salve o tema.
          </Banner>
        ) : null}

        {actionData ? (
          actionData.ok ? (
            <BlockStack gap="300">
              <Banner tone="success" title={actionData.syncOnly ? "Tema atualizado" : "Alterações salvas com sucesso"}>
                {actionData.syncOnly
                  ? "Arquivos do rodapé publicados no tema ativo. Atualize a loja (F5)."
                  : "Suas configurações já estão sendo aplicadas na loja."}
              </Banner>
              {actionData.themeSync && !actionData.themeSync.ok ? (
                <Banner
                  tone="warning"
                  title="Sincronização do tema pendente"
                  action={{
                    content: "Abrir Theme Editor",
                    url: themeDeepLink,
                    external: true,
                  }}
                >
                  {actionData.themeSync.accessDenied
                    ? "Reinstale o app para aceitar write_themes ou use o Theme Editor."
                    : actionData.themeSync.errors.join(" · ")}
                </Banner>
              ) : null}
              {actionData.footerPublish?.published ? (
                <Banner tone="info" title="Rodapé publicado no tema">
                  Trustpilot ativado via app embed e/ou arquivos do tema.
                </Banner>
              ) : null}
              {actionData.footerPublish && !actionData.footerPublish.ok ? (
                <Banner
                  tone="warning"
                  title="Publicação parcial — ative o embed"
                  action={{
                    content: "Ativar no tema",
                    url: actionData.footerPublish.activateUrl,
                    external: true,
                  }}
                >
                  {actionData.footerPublish.errors.join(" · ")}
                </Banner>
              ) : null}
            </BlockStack>
          ) : (
            <Banner tone="critical" title="Erro ao salvar">
              {actionData.errors?.join(" · ")}
            </Banner>
          )
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 380px)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <BlockStack gap="400">
            <Card>
              <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} fitted />
            </Card>

            <form id="storefront-settings-form" method="post" action={paths.appearance}>
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
                          <Badge tone="info">{layoutLabel}</Badge>
                        </InlineStack>
                        <InlineGrid columns={2} gap="300">
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
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Quantidade na vitrine
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Desktop: colunas × linhas na grade. Mobile: lista vertical (1
                          coluna) — configure em &quot;Mobile&quot; abaixo.
                        </Text>
                        <InlineGrid columns={2} gap="400">
                          <RangeField
                            label="Colunas no mobile (legado)"
                            name="reviews_columns_mobile"
                            value={1}
                            min={1}
                            max={1}
                            suffix=" col."
                            onChange={() => set("reviews_columns_mobile", 1)}
                            helpText="No mobile as avaliações aparecem em lista vertical (1 coluna)."
                          />
                          <RangeField
                            label="Colunas no desktop"
                            name="reviews_columns_desktop"
                            value={settings.reviews_columns_desktop}
                            min={1}
                            max={4}
                            suffix=" col."
                            onChange={(v) => set("reviews_columns_desktop", v)}
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <Select
                        label="Onde mostrar avaliações"
                        name="data_source"
                        options={[
                          { label: "Automático (home = shop, produto = product)", value: "auto" },
                          { label: "Página inicial", value: "homepage" },
                          { label: "Produto atual", value: "product" },
                        ]}
                        value={settings.data_source}
                        onChange={(v) =>
                          set("data_source", v as StorefrontSettings["data_source"])
                        }
                      />
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
                          <ColorPickerField
                            label="Estrelas preenchidas"
                            name="stars_color"
                            value={settings.stars_color}
                            onChange={(v) => set("stars_color", v)}
                          />
                          <ColorPickerField
                            label="Estrelas vazias"
                            name="stars_empty_color"
                            value={settings.stars_empty_color}
                            onChange={(v) => set("stars_empty_color", v)}
                          />
                          <ColorPickerField
                            label="Ícone verified"
                            name="verified_icon_color"
                            value={settings.verified_icon_color}
                            onChange={(v) => set("verified_icon_color", v)}
                          />
                          <ColorPickerField
                            label="Paginação ativa"
                            name="pagination_active_color"
                            value={settings.pagination_active_color}
                            onChange={(v) => set("pagination_active_color", v)}
                          />
                          <ColorPickerField
                            label="Paginação inativa"
                            name="pagination_inactive_color"
                            value={settings.pagination_inactive_color}
                            onChange={(v) => set("pagination_inactive_color", v)}
                          />
                          <ColorPickerField
                            label="Texto do rodapé"
                            name="footer_text_color"
                            value={settings.footer_text_color}
                            onChange={(v) => set("footer_text_color", v)}
                          />
                          <ColorPickerField
                            label="Título da avaliação (cards)"
                            name="review_title_color"
                            value={settings.review_title_color}
                            onChange={(v) => set("review_title_color", v)}
                          />
                          <ColorPickerField
                            label="Texto / resumo (cards)"
                            name="review_body_color"
                            value={settings.review_body_color}
                            onChange={(v) => set("review_body_color", v)}
                          />
                          <ColorPickerField
                            label="Autor / data (cards)"
                            name="review_meta_color"
                            value={settings.review_meta_color}
                            onChange={(v) => set("review_meta_color", v)}
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Cards de avaliação
                        </Text>
                        <InlineGrid columns={2} gap="400">
                          <ColorPickerField
                            label="Fundo do card"
                            name="card_background"
                            value={settings.card_background}
                            onChange={(v) => set("card_background", v)}
                          />
                          <ColorPickerField
                            label="Borda do card"
                            name="card_border_color"
                            value={settings.card_border_color}
                            onChange={(v) => set("card_border_color", v)}
                          />
                        </InlineGrid>
                        <InlineGrid columns={2} gap="400">
                          <RangeField
                            label="Raio da borda"
                            name="card_border_radius"
                            value={settings.card_border_radius}
                            min={0}
                            max={24}
                            suffix="px"
                            onChange={(v) => set("card_border_radius", v)}
                          />
                          <RangeField
                            label="Padding interno"
                            name="card_padding"
                            value={settings.card_padding}
                            min={8}
                            max={40}
                            suffix="px"
                            onChange={(v) => set("card_padding", v)}
                          />
                          <RangeField
                            label="Espaço entre cards"
                            name="cards_gap"
                            value={settings.cards_gap}
                            min={0}
                            max={32}
                            suffix="px"
                            onChange={(v) => set("cards_gap", v)}
                          />
                          <RangeField
                            label="Tamanho título"
                            name="review_title_font_size"
                            value={settings.review_title_font_size}
                            min={12}
                            max={28}
                            suffix="px"
                            onChange={(v) => set("review_title_font_size", v)}
                          />
                          <RangeField
                            label="Tamanho texto"
                            name="review_body_font_size"
                            value={settings.review_body_font_size}
                            min={11}
                            max={20}
                            suffix="px"
                            onChange={(v) => set("review_body_font_size", v)}
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Mobile (≤991px)
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Só muda como os cards se organizam no mobile — cores, fontes e
                          conteúdo dos cards vêm das outras opções. Paginação com scroll ao
                          topo ao trocar de página.
                        </Text>
                        <Select
                          label="Organização no mobile"
                          name="reviews_mobile_layout"
                          options={[
                            { label: "Mosaico 2 colunas (recomendado)", value: "masonry" },
                            { label: "Lista vertical (1 coluna)", value: "stack" },
                          ]}
                          value={settings.reviews_mobile_layout}
                          onChange={(v) =>
                            set(
                              "reviews_mobile_layout",
                              v as StorefrontSettings["reviews_mobile_layout"],
                            )
                          }
                        />
                        <InlineGrid columns={2} gap="400">
                          <RangeField
                            label="Espaço superior"
                            name="section_padding_top_mobile"
                            value={settings.section_padding_top_mobile}
                            min={0}
                            max={80}
                            onChange={(v) => set("section_padding_top_mobile", v)}
                          />
                          <RangeField
                            label="Espaço inferior"
                            name="section_padding_bottom_mobile"
                            value={settings.section_padding_bottom_mobile}
                            min={0}
                            max={80}
                            onChange={(v) => set("section_padding_bottom_mobile", v)}
                          />
                          <RangeField
                            label="Espaço lateral"
                            name="section_padding_sides_mobile"
                            value={settings.section_padding_sides_mobile}
                            min={0}
                            max={48}
                            onChange={(v) => set("section_padding_sides_mobile", v)}
                          />
                          <RangeField
                            label="Título da seção"
                            name="section_headline_font_size_mobile"
                            value={settings.section_headline_font_size_mobile}
                            min={14}
                            max={32}
                            suffix="px"
                            onChange={(v) => set("section_headline_font_size_mobile", v)}
                          />
                          <RangeField
                            label="Título do card"
                            name="review_title_font_size_mobile"
                            value={settings.review_title_font_size_mobile}
                            min={12}
                            max={28}
                            suffix="px"
                            onChange={(v) => set("review_title_font_size_mobile", v)}
                          />
                          <RangeField
                            label="Texto do card"
                            name="review_body_font_size_mobile"
                            value={settings.review_body_font_size_mobile}
                            min={11}
                            max={20}
                            suffix="px"
                            onChange={(v) => set("review_body_font_size_mobile", v)}
                          />
                          <RangeField
                            label="Raio do card"
                            name="card_border_radius_mobile"
                            value={settings.card_border_radius_mobile}
                            min={0}
                            max={24}
                            suffix="px"
                            onChange={(v) => set("card_border_radius_mobile", v)}
                          />
                          <RangeField
                            label="Padding do card"
                            name="card_padding_mobile"
                            value={settings.card_padding_mobile}
                            min={8}
                            max={40}
                            suffix="px"
                            onChange={(v) => set("card_padding_mobile", v)}
                          />
                          <RangeField
                            label="Espaço entre cards"
                            name="cards_gap_mobile"
                            value={settings.cards_gap_mobile}
                            min={0}
                            max={32}
                            suffix="px"
                            onChange={(v) => set("cards_gap_mobile", v)}
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h2" variant="headingMd">
                          Cabeçalho da seção
                        </Text>
                        <input type="hidden" name="header_style" value={settings.header_style} />
                        <Select
                          label="Estilo do cabeçalho"
                          options={[
                            {
                              label: "Título + nota (ex.: TRUSTED BY THOUSANDS)",
                              value: "aggregate",
                            },
                            { label: "Nome da loja + trusted by", value: "shop_trusted" },
                          ]}
                          value={settings.header_style}
                          onChange={(v) =>
                            set("header_style", v as StorefrontSettings["header_style"])
                          }
                        />
                        <Checkbox
                          label="Mostrar cabeçalho"
                          name="trusted_show_header"
                          checked={settings.trusted_show_header}
                          onChange={(v) => set("trusted_show_header", v)}
                        />
                        {settings.header_style === "aggregate" ? (
                          <>
                            <TextField
                              label="Título principal (maiúsculas)"
                              name="section_headline"
                              value={settings.section_headline}
                              onChange={(v) => set("section_headline", v)}
                              autoComplete="off"
                              helpText="Ex.: TRUSTED BY THOUSANDS"
                            />
                            <RangeField
                              label="Tamanho do título"
                              name="section_headline_font_size"
                              value={settings.section_headline_font_size}
                              min={14}
                              max={48}
                              suffix="px"
                              onChange={(v) => set("section_headline_font_size", v)}
                            />
                            <Checkbox
                              label="Mostrar logo Trustpilot no resumo"
                              name="header_show_trustpilot_logo"
                              checked={settings.header_show_trustpilot_logo}
                              onChange={(v) => set("header_show_trustpilot_logo", v)}
                            />
                            {settings.header_show_trustpilot_logo ? (
                              <RangeField
                                label="Tamanho da logo Trustpilot"
                                name="header_trustpilot_logo_height"
                                value={settings.header_trustpilot_logo_height}
                                min={12}
                                max={48}
                                suffix="px"
                                onChange={(v) => set("header_trustpilot_logo_height", v)}
                              />
                            ) : null}
                            <TextField
                              label="Prefixo do resumo"
                              name="header_based_on_prefix"
                              value={settings.header_based_on_prefix}
                              onChange={(v) => set("header_based_on_prefix", v)}
                              autoComplete="off"
                              helpText='Ex.: "Based on" → Based on 120 reviews'
                            />
                            <InlineGrid columns={3} gap="300">
                              <ColorPickerField
                                label="Cor da nota"
                                name="header_rating_color"
                                value={settings.header_rating_color}
                                onChange={(v) => set("header_rating_color", v)}
                              />
                              <ColorPickerField
                                label="Estrelas do cabeçalho"
                                name="header_stars_color"
                                value={settings.header_stars_color}
                                onChange={(v) => set("header_stars_color", v)}
                              />
                              <ColorPickerField
                                label="Texto do resumo"
                                name="header_summary_color"
                                value={settings.header_summary_color}
                                onChange={(v) => set("header_summary_color", v)}
                              />
                            </InlineGrid>
                          </>
                        ) : (
                          <InlineGrid columns={2} gap="400">
                            <ColorPickerField
                              label="Destaque"
                              name="trusted_highlight_color"
                              value={settings.trusted_highlight_color}
                              onChange={(v) => set("trusted_highlight_color", v)}
                            />
                            <ColorPickerField
                              label="Texto"
                              name="trusted_text_color"
                              value={settings.trusted_text_color}
                              onChange={(v) => set("trusted_text_color", v)}
                            />
                            <ColorPickerField
                              label="Ícone check"
                              name="trusted_checkmark_color"
                              value={settings.trusted_checkmark_color}
                              onChange={(v) => set("trusted_checkmark_color", v)}
                            />
                          </InlineGrid>
                        )}
                        {settings.header_style === "shop_trusted" ? (
                          <RangeField
                            label="Tamanho do texto trusted"
                            name="trusted_font_size"
                            value={settings.trusted_font_size}
                            min={11}
                            max={24}
                            suffix="px"
                            onChange={(v) => set("trusted_font_size", v)}
                          />
                        ) : null}
                        <RangeField
                          label="Margem abaixo do cabeçalho"
                          name="trusted_margin_bottom"
                          value={settings.trusted_margin_bottom}
                          min={0}
                          max={48}
                          onChange={(v) => set("trusted_margin_bottom", v)}
                        />
                      </BlockStack>
                    </Card>
                  </>
                ) : null}

                {selectedTab === 2 ? (
                  <>
                    <Card>
                      <BlockStack gap="400">
                        <TextField
                          label="Texto após o nome da loja"
                          name="trusted_text_after"
                          value={settings.trusted_text_after}
                          onChange={(v) => set("trusted_text_after", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Texto em destaque"
                          name="trusted_text_highlight"
                          value={settings.trusted_text_highlight}
                          onChange={(v) => set("trusted_text_highlight", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Texto verified"
                          name="verified_label"
                          value={settings.verified_label}
                          onChange={(v) => set("verified_label", v)}
                          autoComplete="off"
                        />
                        <InlineGrid columns={2} gap="400">
                          <TextField
                            label="Máx. chars texto"
                            name="reviews_text_max_chars"
                            type="number"
                            value={String(settings.reviews_text_max_chars)}
                            onChange={(v) =>
                              set("reviews_text_max_chars", parseInt(v, 10) || 150)
                            }
                            autoComplete="off"
                          />
                          <TextField
                            label="Máx. chars título"
                            name="reviews_title_max_chars"
                            type="number"
                            value={String(settings.reviews_title_max_chars)}
                            onChange={(v) =>
                              set("reviews_title_max_chars", parseInt(v, 10) || 80)
                            }
                            autoComplete="off"
                          />
                          <TextField
                            label="Linhas na grade (desktop)"
                            name="reviews_rows"
                            type="number"
                            value={String(settings.reviews_rows)}
                            onChange={(v) => set("reviews_rows", Math.min(4, Math.max(1, parseInt(v, 10) || 2)))}
                            autoComplete="off"
                            helpText={`Desktop: até ${settings.reviews_columns_desktop}×${settings.reviews_rows} cards por página`}
                          />
                          <TextField
                            label="Avaliações por página (desktop)"
                            name="reviews_per_page"
                            type="number"
                            value={String(settings.reviews_per_page)}
                            onChange={(v) => set("reviews_per_page", parseInt(v, 10) || 6)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Avaliações por página (mobile)"
                            name="reviews_per_page_mobile"
                            type="number"
                            value={String(settings.reviews_per_page_mobile)}
                            onChange={(v) =>
                              set(
                                "reviews_per_page_mobile",
                                Math.min(20, Math.max(1, parseInt(v, 10) || 10)),
                              )
                            }
                            autoComplete="off"
                            helpText="Lista vertical: 10 por página, depois paginação (volta ao topo ao trocar)"
                          />
                        </InlineGrid>
                        <Checkbox
                          label="Mostrar Verified Buyer"
                          name="show_verified"
                          checked={settings.show_verified}
                          onChange={(v) => set("show_verified", v)}
                        />
                        <Checkbox
                          label="Mostrar imagens"
                          name="show_images"
                          checked={settings.show_images}
                          onChange={(v) => set("show_images", v)}
                        />
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Checkbox
                          label="Mostrar rodapé"
                          name="footer_show"
                          checked={settings.footer_show}
                          onChange={(v) => set("footer_show", v)}
                        />
                        <InlineGrid columns={2} gap="400">
                          <TextField
                            label="Prefixo"
                            name="footer_prefix"
                            value={settings.footer_prefix}
                            onChange={(v) => set("footer_prefix", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Meio"
                            name="footer_middle"
                            value={settings.footer_middle}
                            onChange={(v) => set("footer_middle", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Sufixo"
                            name="footer_suffix"
                            value={settings.footer_suffix}
                            onChange={(v) => set("footer_suffix", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Nota fallback"
                            name="footer_rating"
                            value={settings.footer_rating}
                            onChange={(v) => set("footer_rating", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Total fallback"
                            name="footer_total"
                            value={settings.footer_total}
                            onChange={(v) => set("footer_total", v)}
                            autoComplete="off"
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingSm">
                          Trustpilot no rodapé do tema
                        </Text>
                        <Text as="p" tone="subdued">
                          Funciona em qualquer tema Shopify: o app embed detecta o rodapé e posiciona o badge abaixo das redes sociais (logo, estrelas e TrustScore). Ative o embed em Configurações do tema → App embeds.
                        </Text>
                        <Checkbox
                          label="Mostrar Trustpilot no rodapé"
                          name="footer_trustpilot_show"
                          checked={settings.footer_trustpilot_show}
                          onChange={(v) => set("footer_trustpilot_show", v)}
                        />
                        <Button onClick={handleSyncFooterTheme}>
                          Aplicar no tema agora
                        </Button>
                        <Text as="p" tone="subdued">
                          Ao salvar, ativa o app embed automaticamente. &quot;Aplicar no tema agora&quot; é opcional (integração extra só para temas Impact com footer customizado).
                        </Text>
                        <InlineGrid columns={2} gap="400">
                          <TextField
                            label="Altura da logo (px)"
                            name="footer_trustpilot_logo_height"
                            type="number"
                            value={String(settings.footer_trustpilot_logo_height)}
                            onChange={(v) =>
                              set("footer_trustpilot_logo_height", parseInt(v, 10) || 20)
                            }
                            autoComplete="off"
                          />
                          <TextField
                            label="Nota fallback"
                            name="footer_rating"
                            value={settings.footer_rating}
                            onChange={(v) => set("footer_rating", v)}
                            autoComplete="off"
                            helpText="Usada se não houver reviews na homepage"
                          />
                          <TextField
                            label="Reviews fallback (número)"
                            name="footer_trustpilot_fallback_count"
                            type="number"
                            value={String(settings.footer_trustpilot_fallback_count)}
                            onChange={(v) =>
                              set("footer_trustpilot_fallback_count", parseInt(v, 10) || 0)
                            }
                            autoComplete="off"
                          />
                          <TextField
                            label="Label TrustScore"
                            name="footer_trustpilot_score_label"
                            value={settings.footer_trustpilot_score_label}
                            onChange={(v) => set("footer_trustpilot_score_label", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Palavra reviews"
                            name="footer_trustpilot_reviews_word"
                            value={settings.footer_trustpilot_reviews_word}
                            onChange={(v) => set("footer_trustpilot_reviews_word", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Cor das estrelas"
                            name="footer_trustpilot_stars_color"
                            value={settings.footer_trustpilot_stars_color}
                            onChange={(v) => set("footer_trustpilot_stars_color", v)}
                            autoComplete="off"
                            placeholder={settings.stars_color || "#00B67A"}
                          />
                          <TextField
                            label="Cor do texto"
                            name="footer_trustpilot_text_color"
                            value={settings.footer_trustpilot_text_color}
                            onChange={(v) => set("footer_trustpilot_text_color", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Cor secundária"
                            name="footer_trustpilot_muted_color"
                            value={settings.footer_trustpilot_muted_color}
                            onChange={(v) => set("footer_trustpilot_muted_color", v)}
                            autoComplete="off"
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Card>
                    <Card>
                      <Checkbox
                        label="Mostrar mensagem quando não há reviews"
                        name="show_empty_message"
                        checked={settings.show_empty_message}
                        onChange={(v) => set("show_empty_message", v)}
                      />
                      <Box paddingBlockStart="300">
                        <TextField
                          label="Texto vazio"
                          name="empty_message"
                          value={settings.empty_message}
                          onChange={(v) => set("empty_message", v)}
                          autoComplete="off"
                          multiline={2}
                        />
                      </Box>
                    </Card>
                  </>
                ) : null}

                {selectedTab === 3 ? (
                  <Card>
                    <BlockStack gap="400">
                      <Checkbox
                        label="Mostrar formulário"
                        name="show_review_form"
                        checked={settings.show_review_form}
                        onChange={(v) => set("show_review_form", v)}
                      />
                      <Checkbox
                        label="Upload de imagens"
                        name="review_form_show_images"
                        checked={settings.review_form_show_images}
                        onChange={(v) => set("review_form_show_images", v)}
                      />
                      <TextField
                        label="Máx. imagens"
                        name="review_form_images_max"
                        type="number"
                        value={String(settings.review_form_images_max)}
                        onChange={(v) => set("review_form_images_max", parseInt(v, 10) || 5)}
                        autoComplete="off"
                      />
                      <Checkbox
                        label="Mostrar mensagem após envio (banner verde)"
                        name="review_form_show_success"
                        checked={settings.review_form_show_success}
                        onChange={(v) => set("review_form_show_success", v)}
                      />
                      <Box opacity={settings.review_form_show_success ? "100" : "60"}>
                        <BlockStack gap="400">
                          <TextField
                            label="Texto da mensagem"
                            name="review_form_success_message"
                            value={settings.review_form_success_message}
                            onChange={(v) => set("review_form_success_message", v)}
                            autoComplete="off"
                            helpText="Vazio = texto padrão em inglês da loja"
                            multiline={2}
                          />
                          <Checkbox
                            label="Mostrar ícone de check na mensagem"
                            name="review_form_success_show_icon"
                            checked={settings.review_form_success_show_icon}
                            onChange={(v) => set("review_form_success_show_icon", v)}
                          />
                          <InlineGrid columns={2} gap="400">
                            <ColorPickerField
                              label="Fundo da mensagem"
                              name="review_form_success_bg"
                              value={settings.review_form_success_bg}
                              onChange={(v) => set("review_form_success_bg", v)}
                            />
                            <ColorPickerField
                              label="Borda da mensagem"
                              name="review_form_success_border"
                              value={settings.review_form_success_border}
                              onChange={(v) => set("review_form_success_border", v)}
                            />
                            <ColorPickerField
                              label="Texto da mensagem"
                              name="review_form_success_text_color"
                              value={settings.review_form_success_text_color}
                              onChange={(v) => set("review_form_success_text_color", v)}
                            />
                            <ColorPickerField
                              label="Ícone da mensagem"
                              name="review_form_success_icon_color"
                              value={settings.review_form_success_icon_color}
                              onChange={(v) => set("review_form_success_icon_color", v)}
                            />
                          </InlineGrid>
                          <InlineGrid columns={2} gap="400">
                            <RangeField
                              label="Raio da mensagem"
                              name="review_form_success_border_radius"
                              value={settings.review_form_success_border_radius}
                              min={0}
                              max={24}
                              suffix="px"
                              onChange={(v) => set("review_form_success_border_radius", v)}
                            />
                            <RangeField
                              label="Tamanho da fonte"
                              name="review_form_success_font_size"
                              value={settings.review_form_success_font_size}
                              min={11}
                              max={22}
                              suffix="px"
                              onChange={(v) => set("review_form_success_font_size", v)}
                            />
                          </InlineGrid>
                        </BlockStack>
                      </Box>
                      <Divider />
                      <Text as="h3" variant="headingSm">
                        Painel do formulário
                      </Text>
                      <InlineGrid columns={2} gap="400">
                        <ColorPickerField
                          label="Fundo do formulário"
                          name="form_panel_background"
                          value={settings.form_panel_background}
                          onChange={(v) => set("form_panel_background", v)}
                        />
                        <ColorPickerField
                          label="Borda do formulário"
                          name="form_panel_border_color"
                          value={settings.form_panel_border_color}
                          onChange={(v) => set("form_panel_border_color", v)}
                        />
                        <ColorPickerField
                          label="Labels do formulário"
                          name="form_label_color"
                          value={settings.form_label_color}
                          onChange={(v) => set("form_label_color", v)}
                        />
                        <ColorPickerField
                          label="Borda dos campos"
                          name="form_input_border_color"
                          value={settings.form_input_border_color}
                          onChange={(v) => set("form_input_border_color", v)}
                        />
                        <RangeField
                          label="Raio do painel"
                          name="form_panel_border_radius"
                          value={settings.form_panel_border_radius}
                          min={0}
                          max={24}
                          suffix="px"
                          onChange={(v) => set("form_panel_border_radius", v)}
                        />
                      </InlineGrid>
                      <Divider />
                      <InlineGrid columns={2} gap="400">
                        <TextField
                          label="Botão escrever"
                          name="review_form_btn_text"
                          value={settings.review_form_btn_text}
                          onChange={(v) => set("review_form_btn_text", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Label nota"
                          name="review_form_rating_label"
                          value={settings.review_form_rating_label}
                          onChange={(v) => set("review_form_rating_label", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Label título"
                          name="review_form_title_label"
                          value={settings.review_form_title_label}
                          onChange={(v) => set("review_form_title_label", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Placeholder título"
                          name="review_form_title_placeholder"
                          value={settings.review_form_title_placeholder}
                          onChange={(v) => set("review_form_title_placeholder", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Label texto"
                          name="review_form_body_label"
                          value={settings.review_form_body_label}
                          onChange={(v) => set("review_form_body_label", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Placeholder texto"
                          name="review_form_body_placeholder"
                          value={settings.review_form_body_placeholder}
                          onChange={(v) => set("review_form_body_placeholder", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Label imagens"
                          name="review_form_images_label"
                          value={settings.review_form_images_label}
                          onChange={(v) => set("review_form_images_label", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Botão imagens"
                          name="review_form_images_btn_text"
                          value={settings.review_form_images_btn_text}
                          onChange={(v) => set("review_form_images_btn_text", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Label nome"
                          name="review_form_author_label"
                          value={settings.review_form_author_label}
                          onChange={(v) => set("review_form_author_label", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Placeholder nome"
                          name="review_form_author_placeholder"
                          value={settings.review_form_author_placeholder}
                          onChange={(v) => set("review_form_author_placeholder", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Botão enviar"
                          name="review_form_submit_text"
                          value={settings.review_form_submit_text}
                          onChange={(v) => set("review_form_submit_text", v)}
                          autoComplete="off"
                        />
                        <TextField
                          label="Botão cancelar"
                          name="review_form_cancel_text"
                          value={settings.review_form_cancel_text}
                          onChange={(v) => set("review_form_cancel_text", v)}
                          autoComplete="off"
                        />
                      </InlineGrid>
                    </BlockStack>
                  </Card>
                ) : null}

                <Button variant="primary" fullWidth onClick={handleSave}>
                  Salvar aparência
                </Button>
              </BlockStack>
            </form>
          </BlockStack>

          <div style={{ position: "sticky", top: 16 }}>
            <Card>
              <StorefrontPreview settings={settings} shopName={shopName} />
            </Card>
          </div>
        </div>
      </BlockStack>
    </Page>
  );
}
