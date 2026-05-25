import fs from "node:fs";
import path from "node:path";
import { getMainThemeId } from "./theme-homepage.server";

type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const THEME_SYNC_DIR = path.join(process.cwd(), "theme-sync");
const FOOTER_MARKER = "vcom-footer-trustpilot";
const SYNC_FILES = [
  "snippets/vcom-footer-trustpilot.liquid",
  "assets/trustpilot-logo.svg",
  "sections/footer.liquid",
] as const;

export type ThemeFooterSyncResult = {
  ok: boolean;
  updated: boolean;
  alreadyConfigured: boolean;
  accessDenied: boolean;
  errors: string[];
};

function readBundledThemeFile(filename: string): string | null {
  const filePath = path.join(THEME_SYNC_DIR, filename);
  try {
    return fs.readFileSync(filePath, "utf8");
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
    query ThemeFile($themeId: ID!, $filenames: [String!]!) {
      theme(id: $themeId) {
        files(filenames: $filenames) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
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
    return { content: null, errors: gqlErrors.map((e) => e.message) };
  }
  const node = json.data?.theme?.files?.nodes?.[0];
  const content = node?.body?.content;
  return {
    content: typeof content === "string" ? content : null,
    errors: [],
  };
}

async function upsertThemeFiles(
  admin: AdminApi,
  themeId: string,
  files: { filename: string; content: string }[],
): Promise<{ ok: boolean; errors: string[]; accessDenied: boolean }> {
  const response = await admin.graphql(
    `#graphql
    mutation UpsertFooterFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        themeId,
        files: files.map((f) => ({
          filename: f.filename,
          body: { type: "TEXT", value: f.content },
        })),
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

/** Publica snippet, logo e footer no tema ao ativar Trustpilot no rodapé. */
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
      errors: ["Tema principal não encontrado."],
    };
  }

  const { content: liveFooter } = await readThemeFile(admin, themeId, "sections/footer.liquid");
  if (liveFooter?.includes(FOOTER_MARKER)) {
    const filesToSync: { filename: string; content: string }[] = [];
    for (const filename of SYNC_FILES) {
      if (filename === "sections/footer.liquid") continue;
      const bundled = readBundledThemeFile(filename);
      if (bundled) filesToSync.push({ filename, content: bundled });
    }
    if (filesToSync.length === 0) {
      return {
        ok: true,
        updated: false,
        alreadyConfigured: true,
        accessDenied: false,
        errors: [],
      };
    }
    const upsert = await upsertThemeFiles(admin, themeId, filesToSync);
    return {
      ok: upsert.ok,
      updated: upsert.ok,
      alreadyConfigured: false,
      accessDenied: upsert.accessDenied,
      errors: upsert.errors,
    };
  }

  const filesToUpload: { filename: string; content: string }[] = [];
  for (const filename of SYNC_FILES) {
    const bundled = readBundledThemeFile(filename);
    if (!bundled) {
      return {
        ok: false,
        updated: false,
        alreadyConfigured: false,
        accessDenied: false,
        errors: [`Arquivo de tema ausente no app: ${filename}`],
      };
    }
    filesToUpload.push({ filename, content: bundled });
  }

  const upsert = await upsertThemeFiles(admin, themeId, filesToUpload);
  return {
    ok: upsert.ok,
    updated: upsert.ok,
    alreadyConfigured: false,
    accessDenied: upsert.accessDenied,
    errors: upsert.errors,
  };
}
