import { badGatewayError } from "@/shared/exceptions";
import type { ShopifyClient } from "@/infra/provider";

export type ShopifyShopData = {
  shop: {
    name: string;
    email: string;
    myshopifyDomain: string;
  };
};

export async function getShopInfo(
  client: ShopifyClient,
): Promise<ShopifyShopData | null> {
  const result = await client.request<ShopifyShopData>(`{
    shop {
      name
      email
      myshopifyDomain
    }
  }`);

  if (result.errors) {
    throw badGatewayError("Failed to fetch shop info", {
      details: { errors: result.errors },
    });
  }

  return result.data ?? null;
}
