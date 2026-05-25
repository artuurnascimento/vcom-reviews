import fs from "node:fs";
import path from "node:path";
import { getMainThemeId } from "./theme-homepage.server";

type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
  rest?: {
    get: (options: {
      path: string;
      query?: Record<string, string | number>;
    }) => Promise<Response>;
    put: (options: {
      path: string;
      data?: Record<string, unknown>;
      type?: string;
    }) => Promise<Response>;
  };
};

type ThemeFileBody = {
  __typename?: string;
  content?: string;
  contentBase64?: string;
  url?: string;
};

const THEME_SYNC_DIR = path.join(process.cwd(), "theme-sync");
/** Footer está integrado quando tem o bloco na coluna da marca */
export const FOOTER_INTEGRATION_MARKER = "footer__brand-social-trustpilot";
const SNIPPET_FILE = "snippets/vcom-footer-trustpilot.liquid";
const LOGO_FILE = "assets/trustpilot-logo.svg";
const FOOTER_FILE = "sections/footer.liquid";

export type ThemeFooterSyncResult = {
  ok: boolean;
  updated: boolean;
  alreadyConfigured: boolean;
  accessDenied: boolean;
  errors: string[];
  details?: string[];
};

function themeIdNumeric(themeGid: string): string {
  return themeGid.split("/").pop() || themeGid;
}

function readBundledThemeFile(filename: string): string | null {
  const filePath = path.join(THEME_SYNC_DIR, filename);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

async function resolveThemeFileBody(body: ThemeFileBody | null | undefined): Promise<string | null> {
  if (!body) return null;
  const typename = body.__typename;
  if (typename === "OnlineStoreThemeFileBodyText") return body.content ?? null;
  if (typename === "OnlineStoreThemeFileBodyBase64" && body.contentBase64) {
    try {
      return Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  if (typename === "OnlineStoreThemeFileBodyUrl" && body.url) {
    try {
      const res = await fetch(body.url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  if (body.content) return body.content;
  if (body.contentBase64) {
    try {
      return Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  if (body.url) {
    try {
      const res = await fetch(body.url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  return null;
}

async function readThemeFileRest(
  admin: AdminApi,
  themeId: string,
  filename: string,
): Promise<string | null> {
  if (!admin.rest) return null;
  try {
    const response = await admin.rest.get({
      path: `themes/${themeIdNumeric(themeId)}/assets`,
      query: { "asset[key]": filename },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { asset?: { value?: string } };
    return data.asset?.value ?? null;
  } catch {
    return null;
  }
}

async function readThemeFile(
  admin: AdminApi,
  themeId: string,
  filename: string,
): Promise<{ content: string | null; errors: string[] }> {
  const response = await admin.graphql(
    `#graphql
    query ThemeFooterFile($themeId: ID!, $filenames: [String!]!) {
      theme(id: $themeId) {
        files(filenames: $filenames) {
          nodes {
            filename
            body {
              __typename
              ... on OnlineStoreThemeFileBodyText { content }
              ... on OnlineStoreThemeFileBodyBase64 { contentBase64 }
              ... on OnlineStoreThemeFileBodyUrl { url }
            }
          }
        }
      }
    }`,
    { variables: { themeId, filenames: [filename] } },
  );
  const json = await response.json();
  const gqlErrors = json.errors as Array<{ message: string }> | undefined;
  if (gqlErrors?.length) {
    const restContent = await readThemeFileRest(admin, themeId, filename);
    if (restContent) return { content: restContent, errors: [] };
    return { content: null, errors: gqlErrors.map((e) => e.message) };
  }
  const body = json.data?.theme?.files?.nodes?.[0]?.body as ThemeFileBody | undefined;
  let content = await resolveThemeFileBody(body);
  if (!content) {
    content = await readThemeFileRest(admin, themeId, filename);
  }
  return { content, errors: [] };
}

async function upsertThemeFileRest(
  admin: AdminApi,
  themeId: string,
  filename: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!admin.rest) return { ok: false, error: "REST API indisponível" };
  try {
    const response = await admin.rest.put({
      path: `themes/${themeIdNumeric(themeId)}/assets`,
      data: { asset: { key: filename, value } },
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text.slice(0, 200) || `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "REST put failed" };
  }
}

async function upsertThemeFileGraphql(
  admin: AdminApi,
  themeId: string,
  filename: string,
  content: string,
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const response = await admin.graphql(
    `#graphql
    mutation UpsertFooterFile($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: [{ filename, body: { type: "TEXT", value: content } }],
      },
    },
  );
  const json = await response.json();
  const gqlErrors = json.errors as Array<{ message: string }> | undefined;
  if (gqlErrors?.length) {
    const accessDenied = gqlErrors.some((e) =>
      /access denied|write_themes|exemption/i.test(e.message),
    );
    return { ok: false, errors: gqlErrors.map((e) => e.message), accessDenied };
  }
  const userErrors = json.data?.themeFilesUpsert?.userErrors || [];
  if (userErrors.length) {
    const messages = userErrors.map((e: { message: string }) => e.message);
    const accessDenied = messages.some((m: string) =>
      /access denied|write_themes|exemption/i.test(m),
    );
    return { ok: false, errors: messages, accessDenied };
  }
  return { ok: true, errors: [], accessDenied: false };
}

async function upsertThemeFile(
  admin: AdminApi,
  themeId: string,
  filename: string,
  content: string,
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const gql = await upsertThemeFileGraphql(admin, themeId, filename, content);
  if (gql.ok) return gql;

  const rest = await upsertThemeFileRest(admin, themeId, filename, content);
  if (rest.ok) return { ok: true, errors: [], accessDenied: false };

  return {
    ok: false,
    errors: [...gql.errors, rest.error].filter(Boolean) as string[],
    accessDenied: gql.accessDenied,
  };
}

const FOOTER_CAPTURE_BLOCK = `  {%- capture vcom_footer_trustpilot -%}{%- render 'vcom-footer-trustpilot' -%}{%- endcapture -%}
  {%- assign vcom_footer_brand_trustpilot_done = false -%}`;

const FOOTER_BRAND_BLOCK = `
                    {%- if vcom_footer_brand_trustpilot_done == false -%}
                      {%- if section.settings.show_social_media or vcom_footer_trustpilot != blank -%}
                        <div class="footer__brand-social-trustpilot v-stack gap-4" style="align-items:flex-start;margin-top:var(--spacing-4, 1rem);">
                          {%- if section.settings.show_social_media -%}
                            {%- render 'social-media' -%}
                          {%- endif -%}
                          {%- if vcom_footer_trustpilot != blank -%}{{ vcom_footer_trustpilot }}{%- endif -%}
                        </div>
                      {%- endif -%}
                      {%- assign vcom_footer_brand_trustpilot_done = true -%}
                    {%- endif -%}`;

/** Aplica patches mínimos no footer.liquid da loja (preserva customizações). */
export function patchFooterLiquid(content: string): { content: string; changed: boolean } {
  let out = content;
  let changed = false;

  if (!out.includes(FOOTER_INTEGRATION_MARKER)) {
    if (!out.includes("capture vcom_footer_trustpilot")) {
      const footerOpen = '<div class="footer">';
      if (out.includes(footerOpen)) {
        out = out.replace(footerOpen, `${footerOpen}\n${FOOTER_CAPTURE_BLOCK}`);
        changed = true;
      }
    }

    if (!out.includes(FOOTER_INTEGRATION_MARKER)) {
      const linksWhen = "{%- when 'links' -%}";
      if (out.includes(linksWhen)) {
        out = out.replace(linksWhen, `${FOOTER_BRAND_BLOCK}\n\n              ${linksWhen}`);
        changed = true;
      } else {
        const textClose = '{%- when \'newsletter\' -%}';
        if (out.includes(textClose)) {
          out = out.replace(textClose, `${FOOTER_BRAND_BLOCK}\n\n              ${textClose}`);
          changed = true;
        }
      }
    }
  }

  return { content: out, changed };
}

function buildFooterLiquidForUpload(liveFooter: string | null, bundledFooter: string): string {
  if (!liveFooter) return bundledFooter;
  if (liveFooter.includes(FOOTER_INTEGRATION_MARKER)) return liveFooter;
  const patched = patchFooterLiquid(liveFooter);
  if (patched.changed) return patched.content;
  return bundledFooter;
}

/** Publica snippet, logo e footer no tema ativo da loja. */
export async function ensureFooterTrustpilotThemeFiles(
  admin: AdminApi,
  enabled: boolean,
): Promise<ThemeFooterSyncResult> {
  if (!enabled) {
    return {
      ok: true,
      updated: false,
      alreadyConfigured: true,
      accessDenied: false,
      errors: [],
    };
  }

  const themeId = await getMainThemeId(admin);
  if (!themeId) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: ["Tema principal (MAIN) não encontrado na loja."],
    };
  }

  const bundledSnippet = readBundledThemeFile(SNIPPET_FILE);
  const bundledLogo = readBundledThemeFile(LOGO_FILE);
  const bundledFooter = readBundledThemeFile(FOOTER_FILE);
  if (!bundledSnippet || !bundledLogo || !bundledFooter) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: [
        "Pacote theme-sync ausente no servidor. Faça redeploy do app no Railway.",
      ],
    };
  }

  const { content: liveFooter, errors: readErrors } = await readThemeFile(
    admin,
    themeId,
    FOOTER_FILE,
  );
  const alreadyConfigured = Boolean(liveFooter?.includes(FOOTER_INTEGRATION_MARKER));
  const footerToUpload = buildFooterLiquidForUpload(liveFooter, bundledFooter);

  const details: string[] = [];
  const allErrors: string[] = [...readErrors];
  let accessDenied = false;
  let anyUpdated = false;

  for (const [filename, content] of [
    [SNIPPET_FILE, bundledSnippet],
    [LOGO_FILE, bundledLogo],
    [FOOTER_FILE, footerToUpload],
  ] as const) {
    const result = await upsertThemeFile(admin, themeId, filename, content);
    if (result.ok) {
      details.push(`✓ ${filename}`);
      anyUpdated = true;
    } else {
      allErrors.push(`${filename}: ${result.errors.join(", ")}`);
      accessDenied = accessDenied || result.accessDenied;
    }
  }

  if (allErrors.length > 0) {
    return {
      ok: false,
      updated: anyUpdated,
      alreadyConfigured,
      accessDenied,
      errors: allErrors,
      details,
    };
  }

  return {
    ok: true,
    updated: anyUpdated,
    alreadyConfigured,
    accessDenied: false,
    errors: [],
    details,
  };
}
