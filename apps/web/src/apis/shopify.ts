import { shopifyClient } from "@/utils/client.shopify";
import type { ApiResponse } from "@/typings/json-api";

export interface ShopInfo {
  name?: string;
  myshopifyDomain?: string;
}

export interface ProductNode {
  id: string;
  title: string;
}

export interface ProductsData {
  products?: {
    edges?: Array<{
      node: ProductNode;
    }>;
  };
}

/**
 * Fetches shop profile data through the app backend.
 */
export function fetchShopInfo(signal: AbortSignal) {
  return shopifyClient.get<ApiResponse<{ shop?: ShopInfo }>>("shop", {
    signal,
  });
}

/**
 * Fetches the product list through the app backend.
 */
export function fetchProducts(signal: AbortSignal) {
  return shopifyClient.get<ApiResponse<ProductsData>>("product", {
    signal,
  });
}
