type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import { REVIEW_METAOBJECT_TYPE } from "./constants";

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
              admin: "MERCHANT_READ_WRITE",
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

  return { ok: errors.length === 0, errors };
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
  const items = [
    {
      id: "metaobject",
      label: "Metaobject review",
      description:
        "Armazena todas as avaliações (sem metafields). Vitrine lê shop.metaobjects.review",
      ready: Boolean(def?.id),
    },
  ];
  return {
    items,
    allReady: Boolean(def?.id),
  };
}
