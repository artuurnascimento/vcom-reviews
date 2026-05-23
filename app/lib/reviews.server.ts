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
  type ReviewFormData,
  type ReviewPlacement,
  type ReviewRecord,
} from "./constants";

function parseMetaobjectNode(node: {
  id: string;
  handle: string;
  fields: Array<{ key: string; value: string | null; type: string }>;
}): ReviewRecord {
  const map = Object.fromEntries(node.fields.map((f) => [f.key, f.value]));
  let images: string[] = [];
  if (map.images) {
    try {
      const parsed = JSON.parse(map.images);
      images = Array.isArray(parsed) ? parsed : [];
    } catch {
      images = [];
    }
  }
  return {
    id: node.id,
    handle: node.handle,
    rating: parseFloat(map.rating || "5") || 5,
    verified_buyer: map.verified_buyer === "true",
    title: map.title || "",
    body: map.body || "",
    author: map.author || "",
    time: map.time || "",
    images,
  };
}

export async function listReviews(
  admin: AdminApi,
  { first = 50, after }: { first?: number; after?: string } = {},
) {
  const response = await admin.graphql(
    `#graphql
    query ListReviews($type: String!, $first: Int!, $after: String) {
      metaobjects(type: $type, first: $first, after: $after, sortKey: "updated_at", reverse: true) {
        edges {
          cursor
          node {
            id
            handle
            fields { key value type }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      variables: { type: REVIEW_METAOBJECT_TYPE, first, after: after ?? null },
    },
  );
  const json = await response.json();
  const edges = json.data?.metaobjects?.edges || [];
  return {
    reviews: edges.map((e: { node: Parameters<typeof parseMetaobjectNode>[0] }) =>
      parseMetaobjectNode(e.node),
    ),
    pageInfo: json.data?.metaobjects?.pageInfo,
  };
}

export async function getReview(admin: AdminApi, id: string) {
  const response = await admin.graphql(
    `#graphql
    query GetReview($id: ID!) {
      metaobject(id: $id) {
        id
        handle
        fields { key value type }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const node = json.data?.metaobject;
  if (!node) return null;
  return parseMetaobjectNode(node);
}

export async function createReview(admin: AdminApi, data: ReviewFormData) {
  const fields = buildMetaobjectFields(data);
  const response = await admin.graphql(
    `#graphql
    mutation CreateReview($metaobject: MetaobjectCreateInput!) {
      metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metaobject: {
          type: REVIEW_METAOBJECT_TYPE,
          fields,
        },
      },
    },
  );
  const json = await response.json();
  const userErrors = json.data?.metaobjectCreate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: { message: string }) => e.message).join(", "));
  }
  const metaobjectId = json.data?.metaobjectCreate?.metaobject?.id as string;
  await appendReviewReference(admin, data.placement, metaobjectId, data.productId);
  return metaobjectId;
}

export async function updateReview(
  admin: AdminApi,
  id: string,
  data: ReviewFormData,
) {
  const fields = buildMetaobjectFields(data);
  const response = await admin.graphql(
    `#graphql
    mutation UpdateReview($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id,
        metaobject: { fields },
      },
    },
  );
  const json = await response.json();
  const userErrors = json.data?.metaobjectUpdate?.userErrors || [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e: { message: string }) => e.message).join(", "));
  }
  return id;
}

export async function deleteReview(admin: AdminApi, id: string) {
  await admin.graphql(
    `#graphql
    mutation DeleteReview($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors { message }
      }
    }`,
    { variables: { id } },
  );
}

function buildMetaobjectFields(data: ReviewFormData) {
  const fields: Array<{ key: string; value: string }> = [
    { key: "rating", value: String(data.rating) },
    { key: "verified_buyer", value: data.verified_buyer ? "true" : "false" },
    { key: "title", value: data.title || "" },
    { key: "body", value: data.body },
    { key: "author", value: data.author },
    { key: "time", value: data.time || "" },
  ];
  fields.push({
    key: "images",
    value: JSON.stringify(data.imageFileIds || []),
  });
  return fields;
}

export async function getFileImageUrls(
  admin: AdminApi,
  fileIds: string[],
): Promise<Record<string, string>> {
  const ids = fileIds.filter(Boolean).slice(0, 6);
  if (!ids.length) return {};

  const response = await admin.graphql(
    `#graphql
    query ReviewImageUrls($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on MediaImage {
          id
          image { url }
        }
        ... on GenericFile {
          id
          url
        }
      }
    }`,
    { variables: { ids } },
  );
  const json = await response.json();
  const out: Record<string, string> = {};
  for (const node of json.data?.nodes || []) {
    if (!node?.id) continue;
    const url = node.image?.url || node.url;
    if (url) out[node.id] = url;
  }
  return out;
}

export async function getReviewPlacement(
  admin: AdminApi,
  reviewId: string,
): Promise<{ placement: ReviewPlacement; productId?: string }> {
  const shopGid = await getShopGid(admin);
  const shopRes = await admin.graphql(
    `#graphql
    query ShopReviews($id: ID!, $namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    {
      variables: {
        id: shopGid,
        namespace: SHOP_REVIEWS_METAFIELD.namespace,
        key: SHOP_REVIEWS_METAFIELD.key,
      },
    },
  );
  const shopJson = await shopRes.json();
  const shopList = parseMetafieldIdList(shopJson.data?.shop?.metafield?.value);
  if (shopList.includes(reviewId)) {
    return { placement: "homepage" };
  }

  const productsRes = await admin.graphql(
    `#graphql
    query ProductsWithReviews {
      products(first: 100) {
        nodes {
          id
          metafield(namespace: "custom", key: "reviews") { value }
        }
      }
    }`,
  );
  const productsJson = await productsRes.json();
  for (const product of productsJson.data?.products?.nodes || []) {
    const list = parseMetafieldIdList(product.metafield?.value);
    if (list.includes(reviewId)) {
      return { placement: "product", productId: product.id };
    }
  }
  return { placement: "homepage" };
}

function parseMetafieldIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendReviewReference(
  admin: AdminApi,
  placement: ReviewPlacement,
  metaobjectId: string,
  productId?: string,
) {
  if (placement === "homepage") {
    await appendToOwnerList(admin, "shop", SHOP_REVIEWS_METAFIELD, metaobjectId);
    return;
  }
  if (!productId) {
    throw new Error("Produto obrigatório para avaliações de produto.");
  }
  await appendToOwnerList(admin, productId, PRODUCT_REVIEWS_METAFIELD, metaobjectId);
}

async function appendToOwnerList(
  admin: AdminApi,
  ownerId: string,
  metafield: { namespace: string; key: string },
  metaobjectId: string,
) {
  const ownerGid =
    ownerId === "shop"
      ? (await getShopGid(admin))
      : ownerId.startsWith("gid://")
        ? ownerId
        : `gid://shopify/Product/${ownerId.replace(/\D/g, "")}`;

  const current = await admin.graphql(
    `#graphql
    query OwnerReviews($id: ID!, $namespace: String!, $key: String!) {
      node(id: $id) {
        ... on Shop {
          metafield(namespace: $namespace, key: $key) { value }
        }
        ... on Product {
          metafield(namespace: $namespace, key: $key) { value }
        }
      }
    }`,
    {
      variables: {
        id: ownerGid,
        namespace: metafield.namespace,
        key: metafield.key,
      },
    },
  );
  const currentJson = await current.json();
  const raw = currentJson.data?.node?.metafield?.value;
  let list: string[] = [];
  if (raw) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  if (!list.includes(metaobjectId)) {
    list.unshift(metaobjectId);
  }

  await admin.graphql(
    `#graphql
    mutation SetReviewsList($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: ownerGid,
            namespace: metafield.namespace,
            key: metafield.key,
            type: "list.metaobject_reference",
            value: JSON.stringify(list),
          },
        ],
      },
    },
  );
}

async function getShopGid(admin: AdminApi) {
  const r = await admin.graphql(`#graphql query { shop { id } }`);
  const j = await r.json();
  return j.data?.shop?.id as string;
}

export async function searchProducts(admin: AdminApi, query: string) {
  const response = await admin.graphql(
    `#graphql
    query SearchProducts($query: String!) {
      products(first: 10, query: $query) {
        nodes { id title handle }
      }
    }`,
    { variables: { query } },
  );
  const json = await response.json();
  return json.data?.products?.nodes || [];
}
