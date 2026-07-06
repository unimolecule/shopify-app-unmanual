import { createMiddleware } from "hono/factory";
import { createRetryableShopifyAdminClient } from "./client";
import type { AppEnv } from "@/typings";

/**
 * Injects a retryable Shopify Admin GraphQL client into the Hono context.
 */
export function shopifyAdminClient() {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set("shopifyAdminClient", await createRetryableShopifyAdminClient(c));
    await next();
  });
}
