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
    }) => Promise<Response>;
  };
};

const SETTINGS_DATA_FILE = "config/settings_data.json";
export const FOOTER_EMBED_HANDLE = "footer-trustpilot-embed";

export type ThemeFooterEmbedResult = {
  ok: boolean;
  activated: boolean;
  alreadyActive: boolean;
  accessDenied: boolean;
  errors: string[];
  activateUrl?: string;
};

function themeIdNumeric(themeGid: string): string {
  return themeGid.split("/").pop() || themeGid;
}

function appEmbedBlockType(): string {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  return `shopify://apps/${apiKey}/blocks/${FOOTER_EMBED_HANDLE}`;
}

export function buildFooterEmbedActivateUrl(shopDomain: string): string {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const params = new URLSearchParams({
    context: "apps",
    activateAppId: `${apiKey}/${FOOTER_EMBED_HANDLE}`,
  });
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

function stripSettingsDataComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//, "").trim();
}

function isEmbedActive(parsed: Record<string, unknown>, blockType: string): boolean {
  const current = parsed.current as Record<string, unknown> | undefined;
  const blocks = current?.blocks as Record<string, { type?: string; disabled?: boolean }> | undefined;
  if (!blocks) return false;
  for (const block of Object.values(blocks)) {
    if (block?.type?.includes(FOOTER_EMBED_HANDLE) || block?.type === blockType) {
      return block.disabled !== true;
    }
  }
  return false;
}

function enableEmbedInSettings(parsed: Record<string, unknown>, blockType: string): boolean {
  const current = (parsed.current as Record<string, unknown>) || {};
  const blocks = (current.blocks as Record<string, { type?: string; disabled?: boolean; settings?: object }>) || {};

  for (const [id, block] of Object.entries(blocks)) {
    if (block?.type?.includes(FOOTER_EMBED_HANDLE) || block?.type === blockType) {
      if (block.disabled === true) {
        blocks[id] = { ...block, disabled: false };
        current.blocks = blocks;
        parsed.current = current;
        return true;
      }
      return false;
    }
  }

  const blockId = `vcom_${FOOTER_EMBED_HANDLE.replace(/-/g, "_")}_${Date.now()}`;
  blocks[blockId] = { type: blockType, disabled: false, settings: {} };
  current.blocks = blocks;
  parsed.current = current;
  return true;
}

async function readSettingsData(
  admin: AdminApi,
  themeId: string,
): Promise<{ raw: string | null; errors: string[] }> {
  const response = await admin.graphql(
    `#graphql
    query SettingsData($themeId: ID!) {
      theme(id: $themeId) {
        files(filenames: ["${SETTINGS_DATA_FILE}"]) {
          nodes {
            body {
              __typename
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
    if (admin.rest) {
      try {
        const res = await admin.rest.get({
          path: `themes/${themeIdNumeric(themeId)}/assets`,
          query: { "asset[key]": SETTINGS_DATA_FILE },
        });
        if (res.ok) {
          const data = (await res.json()) as { asset?: { value?: string } };
          return { raw: data.asset?.value ?? null, errors: [] };
        }
      } catch {
        /* fall through */
      }
    }
    return { raw: null, errors: gqlErrors.map((e) => e.message) };
  }
  const content = json.data?.theme?.files?.nodes?.[0]?.body?.content;
  return { raw: typeof content === "string" ? content : null, errors: [] };
}

async function writeSettingsData(
  admin: AdminApi,
  themeId: string,
  content: string,
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const response = await admin.graphql(
    `#graphql
    mutation SaveSettingsData($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: [
          {
            filename: SETTINGS_DATA_FILE,
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
    if (accessDenied && admin.rest) {
      try {
        const res = await admin.rest.put({
          path: `themes/${themeIdNumeric(themeId)}/assets`,
          data: { asset: { key: SETTINGS_DATA_FILE, value: content } },
        });
        if (res.ok) return { ok: true, errors: [], accessDenied: false };
      } catch {
        /* fall through */
      }
    }
    return {
      ok: false,
      errors: gqlErrors.map((e) => e.message),
      accessDenied,
    };
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

/** Lê o tema sem alterar — para avisos no loader (sem republicar a cada visita). */
export async function checkFooterTrustpilotAppEmbedActive(
  admin: AdminApi,
): Promise<{ ok: boolean; alreadyActive: boolean; errors: string[] }> {
  const themeId = await getMainThemeId(admin);
  if (!themeId) {
    return { ok: false, alreadyActive: false, errors: ["Tema MAIN não encontrado."] };
  }

  const blockType = appEmbedBlockType();
  const { raw, errors: readErrors } = await readSettingsData(admin, themeId);
  if (!raw) {
    return {
      ok: false,
      alreadyActive: false,
      errors: readErrors.length ? readErrors : ["settings_data.json não encontrado."],
    };
  }

  try {
    const parsed = JSON.parse(stripSettingsDataComments(raw)) as Record<string, unknown>;
    return { ok: true, alreadyActive: isEmbedActive(parsed, blockType), errors: [] };
  } catch {
    return { ok: false, alreadyActive: false, errors: ["settings_data.json inválido no tema."] };
  }
}

/** Ativa o app embed no tema publicado (settings_data.json). */
export async function ensureFooterTrustpilotAppEmbed(
  admin: AdminApi,
  shopDomain: string,
  enabled: boolean,
): Promise<ThemeFooterEmbedResult> {
  const activateUrl = buildFooterEmbedActivateUrl(shopDomain);
  if (!enabled) {
    return { ok: true, activated: false, alreadyActive: true, accessDenied: false, activateUrl };
  }

  const themeId = await getMainThemeId(admin);
  if (!themeId) {
    return {
      ok: false,
      activated: false,
      alreadyActive: false,
      accessDenied: false,
      errors: ["Tema MAIN não encontrado."],
      activateUrl,
    };
  }

  const blockType = appEmbedBlockType();
  const { raw, errors: readErrors } = await readSettingsData(admin, themeId);
  if (!raw) {
    return {
      ok: false,
      activated: false,
      alreadyActive: false,
      accessDenied: readErrors.some((e) => /access denied|write_themes/i.test(e)),
      errors: readErrors.length ? readErrors : ["settings_data.json não encontrado."],
      activateUrl,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripSettingsDataComments(raw)) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      activated: false,
      alreadyActive: false,
      accessDenied: false,
      errors: ["settings_data.json inválido no tema."],
      activateUrl,
    };
  }

  if (isEmbedActive(parsed, blockType)) {
    return {
      ok: true,
      activated: false,
      alreadyActive: true,
      accessDenied: false,
      errors: [],
      activateUrl,
    };
  }

  const changed = enableEmbedInSettings(parsed, blockType);
  if (!changed) {
    return {
      ok: true,
      activated: false,
      alreadyActive: true,
      accessDenied: false,
      errors: [],
      activateUrl,
    };
  }

  const header = raw.match(/^\/\*[\s\S]*?\*\//)?.[0] || "";
  const newContent = `${header ? `${header}\n` : ""}${JSON.stringify(parsed, null, 2)}\n`;
  const write = await writeSettingsData(admin, themeId, newContent);
  if (!write.ok) {
    return {
      ok: false,
      activated: false,
      alreadyActive: false,
      accessDenied: write.accessDenied,
      errors: write.errors,
      activateUrl,
    };
  }

  return {
    ok: true,
    activated: true,
    alreadyActive: false,
    accessDenied: false,
    errors: [],
    activateUrl,
  };
}
