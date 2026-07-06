import { runtimeCapabilities } from "@/app/runtime/runtime-capabilities";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

/**
 * Resolves the Shopify session storage adapter from scoped runtime capabilities.
 */
export async function getShopifySessionStorage(c: Context<AppEnv>) {
  return await runtimeCapabilities(c).shopifySessionStorage();
}
