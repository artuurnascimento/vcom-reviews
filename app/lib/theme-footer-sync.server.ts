import {
  ensureFooterTrustpilotThemeFiles,
  type ThemeFooterSyncResult,
} from "./theme-footer.server";
import {
  ensureFooterTrustpilotInFooterGroup,
  type ThemeFooterGroupResult,
} from "./theme-footer-group.server";
import {
  buildFooterEmbedActivateUrl,
  ensureFooterTrustpilotAppEmbed,
  type ThemeFooterEmbedResult,
} from "./theme-footer-embed.server";

type AdminApi = Parameters<typeof ensureFooterTrustpilotThemeFiles>[0];

export type FooterTrustpilotPublishResult = {
  ok: boolean;
  published: boolean;
  activateUrl: string;
  themeFiles: ThemeFooterSyncResult;
  footerGroup: ThemeFooterGroupResult;
  appEmbed: ThemeFooterEmbedResult;
  errors: string[];
};

/** Publica Trustpilot no rodapé (app embed = qualquer tema; sync liquid = opcional no tema Impact). */
export async function ensureFooterTrustpilotPublished(
  admin: AdminApi,
  shopDomain: string,
  enabled: boolean,
): Promise<FooterTrustpilotPublishResult> {
  const activateUrl = buildFooterEmbedActivateUrl(shopDomain);

  if (!enabled) {
    return {
      ok: true,
      published: false,
      activateUrl,
      themeFiles: await ensureFooterTrustpilotThemeFiles(admin, false),
      footerGroup: await ensureFooterTrustpilotInFooterGroup(admin, false),
      appEmbed: await ensureFooterTrustpilotAppEmbed(admin, shopDomain, false),
      errors: [],
    };
  }

  const [themeFiles, footerGroup, appEmbed] = await Promise.all([
    ensureFooterTrustpilotThemeFiles(admin, true),
    ensureFooterTrustpilotInFooterGroup(admin, true),
    ensureFooterTrustpilotAppEmbed(admin, shopDomain, true),
  ]);

  /** Só true quando algo mudou nesta execução (não quando o embed já estava ativo). */
  const published =
    appEmbed.activated || footerGroup.updated || themeFiles.updated;

  const ok = appEmbed.ok || footerGroup.ok || themeFiles.ok;
  const errors = [
    ...appEmbed.errors.map((e) => `[App embed] ${e}`),
    ...footerGroup.errors.map((e) => `[Footer group] ${e}`),
    ...themeFiles.errors.map((e) => `[Tema liquid] ${e}`),
  ];

  return {
    ok,
    published,
    activateUrl,
    themeFiles,
    footerGroup,
    appEmbed,
    errors,
  };
}
