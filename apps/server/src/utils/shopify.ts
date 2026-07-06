import {
  DEFAULT_SHOPIFY_APP_MODES,
  type DEFAULT_SHOPIFY_APP_MODES_VALUES,
} from "@shamt/app-env";

const embeddedAppModeFlags = {
  [DEFAULT_SHOPIFY_APP_MODES.EMBEDDED]: true,
  [DEFAULT_SHOPIFY_APP_MODES.STANDALONE]: false,
} satisfies Record<DEFAULT_SHOPIFY_APP_MODES_VALUES, boolean>;

export function isEmbeddedShopifyAppMode(
  mode: DEFAULT_SHOPIFY_APP_MODES_VALUES,
): boolean {
  return embeddedAppModeFlags[mode];
}
