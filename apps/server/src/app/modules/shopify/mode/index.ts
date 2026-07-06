import { DEFAULT_SHOPIFY_APP_MODES } from "@shamt/app-env";
import { setShopifyModeCapabilities } from "./capabilities";
import { embeddedShopifyModeCapabilities } from "./embedded";
import { standaloneShopifyModeCapabilities } from "./standalone";

setShopifyModeCapabilities(
  DEFAULT_SHOPIFY_APP_MODES.EMBEDDED,
  embeddedShopifyModeCapabilities,
);
setShopifyModeCapabilities(
  DEFAULT_SHOPIFY_APP_MODES.STANDALONE,
  standaloneShopifyModeCapabilities,
);

export * from "./capabilities";
