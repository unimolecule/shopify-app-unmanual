export type BucketObjectKeyInput = {
  date: Date;
  filename: string;
  id: string;
  namespace?: string;
  shopDomain: string;
};

/**
 * Creates a canonical bucket object key under shop/year/month/id.
 *
 * Example:
 * `shop.myshopify.com/product-exports/2026/06/export-id/products.csv`
 */
export function createBucketObjectKey(input: BucketObjectKeyInput): string {
  return `${createBucketObjectPrefix(input)}/${input.filename}`;
}

export function createBucketObjectPrefix(
  input: Omit<BucketObjectKeyInput, "filename">,
): string {
  const year = String(input.date.getUTCFullYear());
  const month = String(input.date.getUTCMonth() + 1).padStart(2, "0");
  const safeShopDomain = input.shopDomain.replaceAll(/[^a-z0-9.-]/gi, "-");
  const namespace = input.namespace ? `/${input.namespace}` : "";

  return `${safeShopDomain}${namespace}/${year}/${month}/${input.id}`;
}
