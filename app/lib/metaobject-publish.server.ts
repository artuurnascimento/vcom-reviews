type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

import {
  LEGACY_REVIEW_METAOBJECT_TYPE,
  REVIEW_METAOBJECT_TYPE,
} from "./constants";

type MetaobjectPublishNode = {
  id: string;
  handle: string;
  capabilities?: {
    publishable?: { status?: string } | null;
  } | null;
};

async function listMetaobjectNodes(
  admin: AdminApi,
  type: string,
  after?: string,
): Promise<{ nodes: MetaobjectPublishNode[]; hasNextPage: boolean; endCursor?: string }> {
  const response = await admin.graphql(
    `#graphql
    query ListMetaobjectsPublish($type: String!, $first: Int!, $after: String) {
      metaobjects(type: $type, first: $first, after: $after) {
        nodes {
          id
          handle
          capabilities {
            publishable {
              status
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }`,
    {
      variables: { type, first: 100, after: after ?? null },
    },
  );
  const json = await response.json();
  const data = json.data?.metaobjects;
  return {
    nodes: data?.nodes || [],
    hasNextPage: Boolean(data?.pageInfo?.hasNextPage),
    endCursor: data?.pageInfo?.endCursor,
  };
}

async function publishMetaobject(admin: AdminApi, id: string): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
    mutation PublishMetaobject($id: ID!) {
      metaobjectUpdate(
        id: $id
        metaobject: { capabilities: { publishable: { status: ACTIVE } } }
      ) {
        userErrors { message }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const errors = json.data?.metaobjectUpdate?.userErrors || [];
  if (errors.length) {
    console.warn("[vcom-reviews] publish metaobject", id, errors);
    return false;
  }
  return true;
}

async function publishDraftsForType(admin: AdminApi, type: string): Promise<number> {
  let published = 0;
  let after: string | undefined;
  let guard = 0;

  do {
    const batch = await listMetaobjectNodes(admin, type, after);
    for (const node of batch.nodes) {
      const status = node.capabilities?.publishable?.status;
      if (status && status !== "ACTIVE") {
        if (await publishMetaobject(admin, node.id)) published++;
      }
    }
    after = batch.endCursor;
    if (!batch.hasNextPage) break;
    guard++;
  } while (guard < 60);

  return published;
}

/** Publica metaobjects em DRAFT para aparecerem na vitrine (capability publishable). */
export async function publishAllReviewMetaobjects(admin: AdminApi): Promise<{
  published: number;
}> {
  let published = 0;
  published += await publishDraftsForType(admin, REVIEW_METAOBJECT_TYPE);
  published += await publishDraftsForType(admin, LEGACY_REVIEW_METAOBJECT_TYPE);
  return { published };
}

export async function ensureReviewDefinitionPublishable(admin: AdminApi): Promise<void> {
  const response = await admin.graphql(
    `#graphql
    query ReviewDefPublishable {
      metaobjectDefinitionByType(type: "${REVIEW_METAOBJECT_TYPE}") {
        id
        capabilities {
          publishable {
            enabled
          }
        }
      }
    }`,
  );
  const json = await response.json();
  const def = json.data?.metaobjectDefinitionByType;
  if (!def?.id) return;
  if (def.capabilities?.publishable?.enabled) return;

  const update = await admin.graphql(
    `#graphql
    mutation EnableReviewPublishable($id: ID!) {
      metaobjectDefinitionUpdate(
        id: $id
        definition: { capabilities: { publishable: { enabled: true } } }
      ) {
        userErrors { message }
      }
    }`,
    { variables: { id: def.id } },
  );
  const updateJson = await update.json();
  const errors = updateJson.data?.metaobjectDefinitionUpdate?.userErrors || [];
  if (errors.length) {
    console.warn("[vcom-reviews] enable publishable on review definition", errors);
  }
}
