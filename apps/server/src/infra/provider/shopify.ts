import {
  createShopifyConfig,
  getShopifyEnvConfig,
} from "@/app/modules/shopify/config";
import { createShopifyClient } from "@/infra/http/shopify";
import { getLoggerProvider } from "./logger";
import { createProviderSignature } from "./signature";
import type { RuntimeConfig } from "@/infra/env";
import type { AppEnv } from "@/typings";
import type { Shopify } from "@shopify/shopify-api";
import type { Context } from "hono";

export type ShopifyClient = Awaited<ReturnType<typeof createShopifyClient>>;

type ShopifyConfigProviderSlot = {
  signature: string;
  value: Shopify;
};

let shopifyConfigProviderSlot: ShopifyConfigProviderSlot | undefined;

export function getShopifyClientProvider(
  c: Context<AppEnv>,
): Promise<ShopifyClient> {
  return createShopifyClient(c);
}

export async function getShopifyConfigProvider(
  config: RuntimeConfig,
): Promise<Shopify> {
  const signature = getShopifyConfigSignature(config);

  if (shopifyConfigProviderSlot?.signature === signature) {
    return shopifyConfigProviderSlot.value;
  }

  const logger = await getLoggerProvider(config);
  const shopify = createShopifyConfig(config, logger);
  setShopifyConfigProvider(shopify, signature);

  return shopify;
}

export function resetShopifyProvider() {
  shopifyConfigProviderSlot = undefined;
}

function setShopifyConfigProvider(shopify: Shopify, signature: string) {
  shopifyConfigProviderSlot = { signature, value: shopify };
}

function getShopifyConfigSignature(config: RuntimeConfig): string {
  return createProviderSignature(getShopifyEnvConfig(config));
}
