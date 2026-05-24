type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Handle do app na URL do bloco (shopify://apps/{handle}/blocks/...) */
export const THEME_APP_HANDLE = "vcom-reviwers";
export const THEME_BLOCK_HANDLE = "product-reviews";
export const THEME_BLOCK_TYPE = `shopify://apps/${THEME_APP_HANDLE}/blocks/${THEME_BLOCK_HANDLE}`;
export const HOMEPAGE_SECTION_ID = "vcom_reviews_homepage";
export const HOMEPAGE_BLOCK_ID = "vcom_reviews_homepage_block";
export const HOMEPAGE_TEMPLATE_FILE = "templates/index.json";
/** Inserir após esta seção na homepage, se existir */
export const HOMEPAGE_INSERT_AFTER_SECTION = "ugc_carousel";

type IndexTemplate = {
  sections: Record<
    string,
    {
      type: string;
      blocks?: Record<string, { type: string; settings?: Record<string, unknown> }>;
      block_order?: string[];
      settings?: Record<string, unknown>;
      disabled?: boolean;
      name?: string;
    }
  >;
  order: string[];
};

export type ThemeHomepageSyncResult = {
  ok: boolean;
  updated: boolean;
  alreadyConfigured: boolean;
  accessDenied: boolean;
  errors: string[];
  deepLink?: string;
};

function isOurAppBlock(blockType: string): boolean {
  return (
    blockType === THEME_BLOCK_TYPE ||
    blockType.endsWith(`/blocks/${THEME_BLOCK_HANDLE}`) ||
    blockType.includes("product-reviews")
  );
}

function buildReviewsSection(): IndexTemplate["sections"][string] {
  return {
    type: "apps",
    blocks: {
      [HOMEPAGE_BLOCK_ID]: {
        type: THEME_BLOCK_TYPE,
        settings: {},
      },
    },
    block_order: [HOMEPAGE_BLOCK_ID],
    settings: {},
  };
}

export function patchIndexTemplateForReviews(
  template: IndexTemplate,
): { changed: boolean; template: IndexTemplate } {
  const next: IndexTemplate = {
    sections: { ...template.sections },
    order: [...(template.order || [])],
  };
  let changed = false;

  let section = next.sections[HOMEPAGE_SECTION_ID];

  if (!section) {
    next.sections[HOMEPAGE_SECTION_ID] = buildReviewsSection();
    if (!next.order.includes(HOMEPAGE_SECTION_ID)) {
      const afterIdx = next.order.indexOf(HOMEPAGE_INSERT_AFTER_SECTION);
      if (afterIdx >= 0) {
        next.order.splice(afterIdx + 1, 0, HOMEPAGE_SECTION_ID);
      } else {
        next.order.push(HOMEPAGE_SECTION_ID);
      }
    }
    return { changed: true, template: next };
  }

  const sectionCopy = {
    ...section,
    blocks: { ...(section.blocks || {}) },
    block_order: [...(section.block_order || [])],
  };

  if (sectionCopy.type !== "apps") {
    sectionCopy.type = "apps";
    changed = true;
  }

  if (sectionCopy.settings && Object.keys(sectionCopy.settings).length > 0) {
    sectionCopy.settings = {};
    changed = true;
  }

  let hasOurBlock = false;
  for (const [blockId, block] of Object.entries(sectionCopy.blocks)) {
    if (!isOurAppBlock(block.type)) continue;
    hasOurBlock = true;
    if (block.settings && Object.keys(block.settings).length > 0) {
      sectionCopy.blocks[blockId] = { ...block, settings: {} };
      changed = true;
    }
  }

  if (!hasOurBlock) {
    sectionCopy.blocks[HOMEPAGE_BLOCK_ID] = {
      type: THEME_BLOCK_TYPE,
      settings: {},
    };
    if (!sectionCopy.block_order.includes(HOMEPAGE_BLOCK_ID)) {
      sectionCopy.block_order.push(HOMEPAGE_BLOCK_ID);
    }
    changed = true;
  }

  if (JSON.stringify(section) !== JSON.stringify(sectionCopy)) {
    next.sections[HOMEPAGE_SECTION_ID] = sectionCopy;
    changed = true;
  }

  return { changed, template: next };
}

export function buildThemeEditorDeepLink(shopDomain: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const params = new URLSearchParams({
    template: "index",
    addAppBlockId: `${apiKey}/${THEME_BLOCK_HANDLE}`,
    target: `sectionId:${HOMEPAGE_SECTION_ID}`,
  });
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

async function getMainThemeId(admin: AdminApi): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query MainTheme {
      themes(first: 20) {
        nodes {
          id
          role
        }
      }
    }`,
  );
  const json = await response.json();
  const nodes = json.data?.themes?.nodes as Array<{ id: string; role: string }> | undefined;
  const main = nodes?.find((t) => t.role === "MAIN");
  return main?.id ?? nodes?.[0]?.id ?? null;
}

async function readIndexTemplate(
  admin: AdminApi,
  themeId: string,
): Promise<{ content: string | null; errors: string[] }> {
  const response = await admin.graphql(
    `#graphql
    query ThemeIndexFile($themeId: ID!) {
      theme(id: $themeId) {
        files(filenames: ["${HOMEPAGE_TEMPLATE_FILE}"], first: 1) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
              ... on OnlineStoreThemeFileBodyBase64 {
                contentBase64
              }
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
  const node = json.data?.theme?.files?.nodes?.[0];
  const body = node?.body as
    | { content?: string; contentBase64?: string }
    | undefined;
  let content = body?.content;
  if (!content && body?.contentBase64) {
    try {
      content = Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return { content: null, errors: ["Não foi possível decodificar index.json (base64)."] };
    }
  }
  return { content: content ?? null, errors: [] };
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/** Remove comentários de linha e bloco preservando strings (JSONC do Theme Editor). */
function stripJsonComments(json: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;

  while (i < json.length) {
    const c = json[i];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && json[i + 1] === "/") {
      i += 2;
      while (i < json.length && json[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && json[i + 1] === "*") {
      i += 2;
      while (i < json.length && !(json[i] === "*" && json[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

function parseIndexJson(raw: string): IndexTemplate | null {
  const cleaned = stripTrailingCommas(stripJsonComments(stripBom(raw.trim())));
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const sections = obj.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return null;

  let order = obj.order;
  if (!Array.isArray(order)) {
    order = Object.keys(sections as Record<string, unknown>);
  }

  return {
    sections: sections as IndexTemplate["sections"],
    order: order as string[],
  };
}

async function upsertIndexTemplate(
  admin: AdminApi,
  themeId: string,
  content: string,
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const response = await admin.graphql(
    `#graphql
    mutation UpsertIndex($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: [
          {
            filename: HOMEPAGE_TEMPLATE_FILE,
            body: { type: "TEXT", value: content },
          },
        ],
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

export async function getThemeHomepageBlockStatus(
  admin: AdminApi,
): Promise<{ configured: boolean; settingsClean: boolean; errors: string[] }> {
  const themeId = await getMainThemeId(admin);
  if (!themeId) {
    return { configured: false, settingsClean: false, errors: ["Tema principal não encontrado."] };
  }

  const { content, errors } = await readIndexTemplate(admin, themeId);
  if (errors.length) return { configured: false, settingsClean: false, errors };
  if (!content) {
    return {
      configured: false,
      settingsClean: false,
      errors: [`Arquivo ${HOMEPAGE_TEMPLATE_FILE} não encontrado no tema.`],
    };
  }

  const template = parseIndexJson(content);
  if (!template) {
    return { configured: false, settingsClean: false, errors: ["index.json inválido."] };
  }

  const section = template.sections[HOMEPAGE_SECTION_ID];
  if (!section) {
    return { configured: false, settingsClean: true, errors: [] };
  }

  let settingsClean = true;
  if (section.settings && Object.keys(section.settings).length > 0) {
    settingsClean = false;
  }
  for (const block of Object.values(section.blocks || {})) {
    if (isOurAppBlock(block.type) && block.settings && Object.keys(block.settings).length > 0) {
      settingsClean = false;
      break;
    }
  }

  return { configured: true, settingsClean, errors: [] };
}

export async function ensureHomepageReviewsThemeBlock(
  admin: AdminApi,
  shopDomain?: string,
): Promise<ThemeHomepageSyncResult> {
  const deepLink = shopDomain ? buildThemeEditorDeepLink(shopDomain) : undefined;
  const themeId = await getMainThemeId(admin);
  if (!themeId) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: ["Tema principal não encontrado."],
      deepLink,
    };
  }

  const { content, errors: readErrors } = await readIndexTemplate(admin, themeId);
  if (readErrors.length) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: readErrors.some((e) => /access denied/i.test(e)),
      errors: readErrors,
      deepLink,
    };
  }
  if (!content) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: [`Arquivo ${HOMEPAGE_TEMPLATE_FILE} não encontrado.`],
      deepLink,
    };
  }

  const template = parseIndexJson(content);
  if (!template) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: false,
      errors: ["Não foi possível interpretar templates/index.json."],
      deepLink,
    };
  }

  const { changed, template: patched } = patchIndexTemplateForReviews(template);
  if (!changed) {
    return {
      ok: true,
      updated: false,
      alreadyConfigured: true,
      accessDenied: false,
      errors: [],
      deepLink,
    };
  }

  const newContent = `${JSON.stringify(patched, null, 2)}\n`;
  const upsert = await upsertIndexTemplate(admin, themeId, newContent);
  if (!upsert.ok) {
    return {
      ok: false,
      updated: false,
      alreadyConfigured: false,
      accessDenied: upsert.accessDenied,
      errors: upsert.errors,
      deepLink,
    };
  }

  return {
    ok: true,
    updated: true,
    alreadyConfigured: false,
    accessDenied: false,
    errors: [],
    deepLink,
  };
}
