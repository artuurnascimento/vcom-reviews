type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import {
  REVIEW_METAOBJECT_TYPE,
  LEGACY_REVIEW_METAOBJECT_TYPE,
} from "./constants";
import {
  ensureHomepageReviewsThemeBlock,
  getThemeHomepageBlockStatus,
  type ThemeHomepageSyncResult,
} from "./theme-homepage.server";

const REVIEW_FIELD_DEFINITIONS = [
  { key: "rating", name: "Rating", type: "number_decimal", required: true },
  { key: "verified_buyer", name: "Verified buyer", type: "boolean" },
  { key: "title", name: "Title", type: "single_line_text_field" },
  { key: "body", name: "Body", type: "multi_line_text_field", required: true },
  { key: "author", name: "Author", type: "single_line_text_field", required: true },
  { key: "time", name: "Time", type: "single_line_text_field" },
  { key: "status", name: "Status", type: "single_line_text_field" },
  { key: "placement", name: "Placement", type: "single_line_text_field" },
  { key: "product_id", name: "Product ID", type: "single_line_text_field" },
  {
    key: "images",
    name: "Images",
    type: "list.file_reference",
  },
];

export async function ensureReviewInfrastructure(admin: AdminApi) {
  const errors: string[] = [];

  const existing = await admin.graphql(
    `#graphql
    query ReviewDefinition {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") {
        id
      }
    }`,
  );
  const existingJson = await existing.json();
  const defId = existingJson.data?.metaobjectDefinitionByType?.id;

  if (!defId) {
    const create = await admin.graphql(
      `#graphql
      mutation CreateReviewDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id type }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          definition: {
            name: "Review",
            type: REVIEW_METAOBJECT_TYPE,
            access: {
              storefront: "PUBLIC_READ",
            },
            fieldDefinitions: REVIEW_FIELD_DEFINITIONS.map((f) => ({
              key: f.key,
              name: f.name,
              type: f.type,
              required: f.required ?? false,
            })),
          },
        },
      },
    );
    const createJson = await create.json();
    const userErrors = createJson.data?.metaobjectDefinitionCreate?.userErrors || [];
    if (userErrors.length) {
      errors.push(...userErrors.map((e: { message: string }) => e.message));
    }
  }

  if (errors.length === 0) {
    try {
      await migrateLegacyAppReviews(admin);
    } catch (error) {
      console.error("[vcom-reviews] legacy migration error", error);
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Metaobject + bloco na homepage — idempotente, seguro chamar várias vezes. */
export async function runAutomaticInfrastructureSetup(
  admin: AdminApi,
  shopDomain?: string,
): Promise<{
  ok: boolean;
  errors: string[];
  theme: ThemeHomepageSyncResult;
}> {
  const infra = await ensureReviewInfrastructure(admin);
  const theme = await ensureHomepageReviewsThemeBlock(admin, shopDomain);
  return {
    ok: infra.ok && theme.ok,
    errors: [...infra.errors, ...theme.errors],
    theme,
  };
}

async function fetchMetaobjectNodes(admin: AdminApi, type: string) {
  const response = await admin.graphql(
    `#graphql
    query LegacyReviews($type: String!) {
      metaobjects(type: $type, first: 250) {
        nodes {
          handle
          fields { key value }
        }
      }
    }`,
    { variables: { type } },
  );
  const json = await response.json();
  return (json.data?.metaobjects?.nodes || []) as Array<{
    handle: string;
    fields: Array<{ key: string; value: string | null }>;
  }>;
}

async function migrateLegacyAppReviews(admin: AdminApi) {
  const legacy = await fetchMetaobjectNodes(admin, LEGACY_REVIEW_METAOBJECT_TYPE);
  if (!legacy.length) return;

  const current = await fetchMetaobjectNodes(admin, REVIEW_METAOBJECT_TYPE);
  const handles = new Set(current.map((node) => node.handle));

  for (const node of legacy) {
    if (handles.has(node.handle)) continue;

    const create = await admin.graphql(
      `#graphql
      mutation MigrateReview($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metaobject: {
            type: REVIEW_METAOBJECT_TYPE,
            handle: node.handle,
            fields: node.fields
              .filter((f) => f.value != null && f.value !== "")
              .map((f) => ({ key: f.key, value: f.value as string })),
          },
        },
      },
    );
    const createJson = await create.json();
    const userErrors = createJson.data?.metaobjectCreate?.userErrors || [];
    if (userErrors.length) {
      console.error("[vcom-reviews] migrate review failed", node.handle, userErrors);
    }
  }
}

/** Garante que o tipo review existe antes de criar/listar avaliações */
export async function ensureReviewDefinitionReady(admin: AdminApi) {
  const check = await admin.graphql(
    `#graphql
    query ReviewDefinitionCheck {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") { id }
    }`,
  );
  const checkJson = await check.json();
  if (checkJson.data?.metaobjectDefinitionByType?.id) {
    try {
      await migrateLegacyAppReviews(admin);
    } catch (error) {
      console.error("[vcom-reviews] legacy migration error", error);
    }
    return { ok: true, errors: [] as string[] };
  }
  return ensureReviewInfrastructure(admin);
}

export async function getInfrastructureStatus(admin: AdminApi) {
  const response = await admin.graphql(
    `#graphql
    query InfraStatus {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") { id type }
    }`,
  );
  const json = await response.json();
  const def = json.data?.metaobjectDefinitionByType;
  const themeStatus = await getThemeHomepageBlockStatus(admin);
  const themeReady = themeStatus.configured && themeStatus.settingsClean;
  const items = [
    {
      id: "metaobject",
      label: "Metaobject review",
      description:
        "Armazena todas as avaliações (sem metafields). Vitrine lê shop.metaobjects.review",
      ready: Boolean(def?.id),
    },
    {
      id: "homepage_theme",
      label: "Bloco na homepage (index.json)",
      description:
        "Seção vcom_reviews_homepage com settings vazios — visual configurado só no app",
      ready: themeReady,
    },
  ];
  return {
    items,
    allReady: Boolean(def?.id) && themeReady,
    themeStatus,
  };
}
