import { getMainThemeId } from "./theme-homepage.server";

type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const FOOTER_GROUP_FILE = "sections/footer-group.json";
export const FOOTER_GROUP_SECTION_ID = "vcom_reviews_footer_trustpilot";
export const FOOTER_GROUP_BLOCK_ID = "vcom_reviews_footer_trustpilot_block";

export type ThemeFooterGroupResult = {
  ok: boolean;
  updated: boolean;
  alreadyConfigured: boolean;
  accessDenied: boolean;
  errors: string[];
};

type FooterGroupTemplate = {
  type?: string;
  name?: string;
  sections: Record<
    string,
    {
      type: string;
      blocks?: Record<string, { type: string; settings?: Record<string, unknown> }>;
      block_order?: string[];
      settings?: Record<string, unknown>;
      disabled?: boolean;
    }
  >;
  order: string[];
};

/** Remove seção apps legada — o badge fica no bloco da marca via app embed + footer.liquid. */
function patchFooterGroup(template: FooterGroupTemplate): { changed: boolean; template: FooterGroupTemplate } {
  const next: FooterGroupTemplate = {
    ...template,
    sections: { ...template.sections },
    order: [...(template.order || [])],
  };

  if (!next.sections[FOOTER_GROUP_SECTION_ID]) {
    return { changed: false, template: next };
  }

  delete next.sections[FOOTER_GROUP_SECTION_ID];
  next.order = next.order.filter((id) => id !== FOOTER_GROUP_SECTION_ID);
  return { changed: true, template: next };
}

async function readFooterGroup(
  admin: AdminApi,
  themeId: string,
): Promise<{ content: string | null; errors: string[] }> {
  const response = await admin.graphql(
    `#graphql
    query FooterGroup($themeId: ID!) {
      theme(id: $themeId) {
        files(filenames: ["${FOOTER_GROUP_FILE}"]) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText { content }
            }
          }
        }
      }
    }`,
    { variables: { themeId } },
  );
  const json = await response.json();
  const gqlErrors = json.errors as Array<{ message: string }> | undefined;
  if (gqlErrors?.length) {
    return { content: null, errors: gqlErrors.map((e) => e.message) };
  }
  const content = json.data?.theme?.files?.nodes?.[0]?.body?.content;
  return { content: typeof content === "string" ? content : null, errors: [] };
}

async function writeFooterGroup(
  admin: AdminApi,
  themeId: string,
  content: string,
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const response = await admin.graphql(
    `#graphql
    mutation SaveFooterGroup($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: [{ filename: FOOTER_GROUP_FILE, body: { type: "TEXT", value: content } }],
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
    return {
      ok: false,
      errors: messages,
      accessDenied: messages.some((m: string) => /access denied|write_themes|exemption/i.test(m)),
    };
  }
  return { ok: true, errors: [], accessDenied: false };
}

export async function ensureFooterTrustpilotInFooterGroup(
  admin: AdminApi,
  enabled: boolean,
): Promise<ThemeFooterGroupResult> {
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
      errors: ["Tema MAIN não encontrado."],
    };
  }

  const { content, errors: readErrors } = await readFooterGroup(admin, themeId);
  if (!content) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: readErrors.some((e) => /access denied/i.test(e)),
      errors: readErrors.length ? readErrors : [`${FOOTER_GROUP_FILE} não encontrado.`],
    };
  }

  let template: FooterGroupTemplate;
  try {
    template = JSON.parse(content) as FooterGroupTemplate;
  } catch {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: ["footer-group.json inválido."],
    };
  }

  const { changed, template: patched } = patchFooterGroup(template);
  if (!changed) {
    return {
      ok: true,
      updated: false,
      alreadyConfigured: true,
      accessDenied: false,
      errors: [],
    };
  }

  const write = await writeFooterGroup(admin, themeId, `${JSON.stringify(patched)}\n`);
  return {
    ok: write.ok,
    updated: write.ok,
    alreadyConfigured: false,
    accessDenied: write.accessDenied,
    errors: write.errors,
  };
}
