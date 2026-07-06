import { getEnvProvider, getShopifyConfigProvider } from "@/infra/provider";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

/**
 * Factory to create a ShopifyClient from the Hono context.
 * Requires verifySessionToken + tokenExchange middleware to have run.
 */
export async function createShopifyClient(c: Context<AppEnv>) {
  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const shopify = await getShopifyConfigProvider(config);

  return new shopify.clients.Graphql({ session: c.var.shopifySession });
}
