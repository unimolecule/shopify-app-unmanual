import {
  getEnvProvider,
  getLoggerProvider,
  getShopifyClientProvider,
  type ShopifyClient,
} from "@/infra/provider";
import { getShopifyModeCapabilities } from "../mode";
import { setShopifySessionContext } from "../session";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

type ShopifyClientRequest = (...args: unknown[]) => Promise<unknown>;

/**
 * Creates an Admin GraphQL client that refreshes the current Shopify session once on 401.
 */
export async function createRetryableShopifyAdminClient(
  c: Context<AppEnv>,
): Promise<ShopifyClient> {
  let client = await getShopifyClientProvider(c);

  return new Proxy(client, {
    get(_target, prop) {
      if (prop !== "request") {
        return Reflect.get(client as object, prop, client);
      }

      return async (...args: unknown[]) => {
        try {
          return await (client.request as ShopifyClientRequest)(...args);
        } catch (error) {
          if (!isShopifyUnauthorizedResponse(error)) {
            throw error;
          }

          const logger = await getLoggerProvider(
            getEnvProvider(c.get("runtimeEnv") ?? c.env),
          );
          logger.warn(
            `Shopify Admin API returned 401 for ${c.var.shopDomain}; refreshing session and retrying once`,
          );

          setShopifySessionContext(
            c,
            await getShopifyModeCapabilities(
              getEnvProvider(c.get("runtimeEnv") ?? c.env).SHOPIFY_APP_MODE,
            ).refreshAdminSession(c),
          );
          client = await getShopifyClientProvider(c);

          return (client.request as ShopifyClientRequest)(...args);
        }
      };
    },
  }) as ShopifyClient;
}

/**
 * Detects Shopify Admin API authorization failures across response shapes.
 */
function isShopifyUnauthorizedResponse(error: unknown): boolean {
  const response = (
    error as { response?: { code?: unknown; status?: unknown } }
  )?.response;

  return response?.code === 401 || response?.status === 401;
}
