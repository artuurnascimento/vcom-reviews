import { THEME_APP_HANDLE, getMainThemeId } from "./theme-homepage.server";

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

function footerBlockType(): string {
  return `shopify://apps/${THEME_APP_HANDLE}/blocks/footer-trustpilot`;
}

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

function patchFooterGroup(template: FooterGroupTemplate): { changed: boolean; template: FooterGroupTemplate } {
  const next: FooterGroupTemplate = {
    ...template,
    sections: { ...template.sections },
    order: [...(template.order || [])],
  };
  let changed = false;

  if (!next.sections[FOOTER_GROUP_SECTION_ID]) {
    next.sections[FOOTER_GROUP_SECTION_ID] = {
      type: "apps",
      blocks: {
        [FOOTER_GROUP_BLOCK_ID]: {
          type: footerBlockType(),
          settings: {},
        },
      },
      block_order: [FOOTER_GROUP_BLOCK_ID],
      settings: {},
    };
    if (!next.order.includes(FOOTER_GROUP_SECTION_ID)) {
      const footerIdx = next.order.indexOf("footer");
      if (footerIdx >= 0) {
        next.order.splice(footerIdx + 1, 0, FOOTER_GROUP_SECTION_ID);
      } else {
        next.order.push(FOOTER_GROUP_SECTION_ID);
      }
    }
    return { changed: true, template: next };
  }

  const section = {
    ...next.sections[FOOTER_GROUP_SECTION_ID],
    blocks: { ...(next.sections[FOOTER_GROUP_SECTION_ID].blocks || {}) },
    block_order: [...(next.sections[FOOTER_GROUP_SECTION_ID].block_order || [])],
  };

  if (section.type !== "apps") {
    section.type = "apps";
    changed = true;
  }

  const blockType = footerBlockType();
  let hasBlock = false;
  for (const block of Object.values(section.blocks)) {
    if (block.type?.includes("footer-trustpilot")) {
      hasBlock = true;
      break;
    }
  }

  if (!hasBlock) {
    section.blocks[FOOTER_GROUP_BLOCK_ID] = { type: blockType, settings: {} };
    if (!section.block_order.includes(FOOTER_GROUP_BLOCK_ID)) {
      section.block_order.push(FOOTER_GROUP_BLOCK_ID);
    }
    changed = true;
  }

  if (changed) {
    next.sections[FOOTER_GROUP_SECTION_ID] = section;
  }

  return { changed, template: next };
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
      accessDenied: messages.some((m) => /access denied|write_themes|exemption/i.test(m)),
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
