export type StoreProductSearchRow = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  status: string;
  imageUrl: string;
  imageAlt: string;
};

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
