import { badGatewayError } from "@/shared/exceptions";
import type { ShopifyClient } from "@/infra/provider";

export type ShopifyProductsData = {
  products: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        status: string;
      };
    }>;
  };
};

export async function getProducts(
  client: ShopifyClient,
): Promise<ShopifyProductsData | null> {
  const result = await client.request<ShopifyProductsData>(`{
    products(first: 5) {
      edges {
        node {
          id
          title
          status
        }
      }
    }
  }`);

  if (result.errors) {
    throw badGatewayError("Failed to fetch products", {
      details: { errors: result.errors },
    });
  }

  return result.data ?? null;
}
