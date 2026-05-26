type AdminApi = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type StoreProductSearchRow = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  status: string;
  imageUrl: string;
  imageAlt: string;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  productType?: string;
  status?: string;
  featuredImage?: { url?: string; altText?: string } | null;
  media?: {
    nodes?: Array<{
      image?: { url?: string; altText?: string };
    }>;
  };
};

const PRODUCTS_QUERY = `#graphql
  query VcomSearchProducts($first: Int!, $query: String) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        productType
        status
        featuredImage {
          url
          altText
        }
        media(first: 1) {
          nodes {
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;

function mapProductNode(node: ProductNode): StoreProductSearchRow {
  const mediaImage = node.media?.nodes?.[0]?.image;
  const imageUrl = node.featuredImage?.url || mediaImage?.url || "";
  const imageAlt =
    node.featuredImage?.altText || mediaImage?.altText || node.title;

  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    productType: node.productType || "",
    status: node.status || "",
    imageUrl,
    imageAlt,
  };
}

function parseProductsResponse(json: {
  data?: { products?: { nodes?: ProductNode[] } };
  errors?: Array<{ message: string }>;
}): StoreProductSearchRow[] {
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join("; ");
    if (/access denied|read_products/i.test(msg)) {
      throw new Error(
        "Sem permissão read_products. Reinstale o app na loja e aceite as permissões de catálogo.",
      );
    }
    throw new Error(msg);
  }

  return (json.data?.products?.nodes || []).map(mapProductNode);
}

const PRODUCTS_MINIMAL_QUERY = `#graphql
  query VcomSearchProductsMinimal($first: Int!, $query: String) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        productType
        status
        featuredImage {
          url
          altText
        }
      }
    }
  }
`;

async function fetchProducts(
  admin: AdminApi,
  first: number,
  query?: string,
): Promise<StoreProductSearchRow[]> {
  const variables: { first: number; query?: string } = { first };
  if (query?.trim()) {
    variables.query = query;
  }

  const response = await admin.graphql(PRODUCTS_QUERY, { variables });
  const json = (await response.json()) as {
    data?: { products?: { nodes?: ProductNode[] } };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    const fallback = await admin.graphql(PRODUCTS_MINIMAL_QUERY, { variables });
    const fallbackJson = (await fallback.json()) as {
      data?: { products?: { nodes?: ProductNode[] } };
      errors?: Array<{ message: string }>;
    };
    return parseProductsResponse(fallbackJson);
  }

  return parseProductsResponse(json);
}

/** Lista catálogo sem filtro de busca (mais confiável que query status:active). */
export async function listStoreProducts(
  admin: AdminApi,
  { first = 25 }: { first?: number } = {},
): Promise<StoreProductSearchRow[]> {
  return fetchProducts(admin, first);
}

export function filterProductsByTerm(
  products: StoreProductSearchRow[],
  raw: string,
): StoreProductSearchRow[] {
  const term = raw.trim().toLowerCase();
  if (!term) return products;

  const words = term.split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    const hay = `${p.title} ${p.handle} ${p.productType} ${p.status}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function buildProductSearchQuery(raw: string): string | undefined {
  const term = raw.trim();
  if (!term) return undefined;

  const words = term
    .replace(/["*:]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1);

  if (words.length === 0) return undefined;

  const clauses = words.flatMap((w) => [
    `title:*${w}*`,
    `tag:*${w}*`,
    `product_type:*${w}*`,
    `vendor:*${w}*`,
    `sku:*${w}*`,
    `handle:*${w}*`,
  ]);

  return `(${clauses.join(" OR ")})`;
}

export async function searchProducts(
  admin: AdminApi,
  query: string,
  { first = 15 }: { first?: number } = {},
): Promise<StoreProductSearchRow[]> {
  const term = query.trim();

  if (!term) {
    return listStoreProducts(admin, { first: Math.max(first, 25) });
  }

  const catalog = await listStoreProducts(admin, { first: 50 });
  const local = filterProductsByTerm(catalog, term);
  if (local.length > 0) {
    return local.slice(0, first);
  }

  const attempts = [
    buildProductSearchQuery(term),
    term,
    `title:*${term}*`,
    `handle:*${term}*`,
  ].filter((q, i, arr): q is string => Boolean(q) && arr.indexOf(q) === i);

  for (const shopifyQuery of attempts) {
    try {
      const remote = await fetchProducts(admin, first, shopifyQuery);
      if (remote.length > 0) return remote;
    } catch (error) {
      console.warn("[vcom-reviews] product search attempt failed", shopifyQuery, error);
    }
  }

  return [];
}
