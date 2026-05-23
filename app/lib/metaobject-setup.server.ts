type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
import {
  PRODUCT_REVIEWS_METAFIELD,
  REVIEW_METAOBJECT_TYPE,
  SHOP_REVIEWS_METAFIELD,
  SHOP_TRUSTED_AVATARS_METAFIELD,
} from "./constants";

const REVIEW_FIELD_DEFINITIONS = [
  { key: "rating", name: "Rating", type: "number_decimal", required: true },
  { key: "verified_buyer", name: "Verified buyer", type: "boolean" },
  { key: "title", name: "Title", type: "single_line_text_field" },
  { key: "body", name: "Body", type: "multi_line_text_field", required: true },
  { key: "author", name: "Author", type: "single_line_text_field", required: true },
  { key: "time", name: "Time", type: "single_line_text_field" },
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

  await ensureMetafieldDefinition(admin, {
    name: "Product reviews",
    namespace: PRODUCT_REVIEWS_METAFIELD.namespace,
    key: PRODUCT_REVIEWS_METAFIELD.key,
    ownerType: "PRODUCT",
    type: "list.metaobject_reference",
  });

  await ensureMetafieldDefinition(admin, {
    name: "Homepage reviews",
    namespace: SHOP_REVIEWS_METAFIELD.namespace,
    key: SHOP_REVIEWS_METAFIELD.key,
    ownerType: "SHOP",
    type: "list.metaobject_reference",
  });

  await ensureMetafieldDefinition(admin, {
    name: "Trusted avatars",
    namespace: SHOP_TRUSTED_AVATARS_METAFIELD.namespace,
    key: SHOP_TRUSTED_AVATARS_METAFIELD.key,
    ownerType: "SHOP",
    type: "list.file_reference",
  });

  return { ok: errors.length === 0, errors };
}

export async function getInfrastructureStatus(admin: AdminApi) {
  const response = await admin.graphql(
    `#graphql
    query InfraStatus {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") { id }
      productDef: metafieldDefinitions(ownerType: PRODUCT, first: 1, namespace: "${PRODUCT_REVIEWS_METAFIELD.namespace}", key: "${PRODUCT_REVIEWS_METAFIELD.key}") {
        nodes { id }
      }
      shopReviewsDef: metafieldDefinitions(ownerType: SHOP, first: 1, namespace: "${SHOP_REVIEWS_METAFIELD.namespace}", key: "${SHOP_REVIEWS_METAFIELD.key}") {
        nodes { id }
      }
      shopAvatarsDef: metafieldDefinitions(ownerType: SHOP, first: 1, namespace: "${SHOP_TRUSTED_AVATARS_METAFIELD.namespace}", key: "${SHOP_TRUSTED_AVATARS_METAFIELD.key}") {
        nodes { id }
      }
    }`,
  );
  const json = await response.json();
  const items = [
    {
      id: "metaobject",
      label: "Metaobject review",
      description: "Definição do tipo review (campos de avaliação)",
      ready: Boolean(json.data?.metaobjectDefinitionByType?.id),
    },
    {
      id: "shop-reviews",
      label: "Metafield loja · custom.reviews",
      description: "Lista de reviews na homepage",
      ready: Boolean(json.data?.shopReviewsDef?.nodes?.length),
    },
    {
      id: "product-reviews",
      label: "Metafield produto · custom.reviews",
      description: "Lista de reviews por produto",
      ready: Boolean(json.data?.productDef?.nodes?.length),
    },
    {
      id: "trusted-avatars",
      label: "Metafield loja · reviews_trusted_avatars",
      description: "Fotos da linha trusted by (opcional)",
      ready: Boolean(json.data?.shopAvatarsDef?.nodes?.length),
    },
  ];
  return {
    items,
    allReady: items.every((i) => i.ready),
  };
}

async function ensureMetafieldDefinition(
  admin: AdminApi,
  input: {
    name: string;
    namespace: string;
    key: string;
    ownerType: string;
    type: string;
  },
) {
  const q = await admin.graphql(
    `#graphql
    query MetafieldDef($ownerType: MetafieldOwnerType!, $namespace: String!, $key: String!) {
      metafieldDefinitions(ownerType: $ownerType, first: 1, namespace: $namespace, key: $key) {
        nodes { id }
      }
    }`,
    {
      variables: {
        ownerType: input.ownerType,
        namespace: input.namespace,
        key: input.key,
      },
    },
  );
  const qJson = await q.json();
  if (qJson.data?.metafieldDefinitions?.nodes?.length) return;

  await admin.graphql(
    `#graphql
    mutation CreateMetafieldDef($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id }
        userErrors { message }
      }
    }`,
    {
      variables: {
        definition: {
          name: input.name,
          namespace: input.namespace,
          key: input.key,
          ownerType: input.ownerType,
          type: input.type,
          validations: input.type.includes("metaobject")
            ? [{ name: "metaobject_definition_type", value: REVIEW_METAOBJECT_TYPE }]
            : undefined,
        },
      },
    },
  );
}
