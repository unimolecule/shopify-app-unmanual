import {
  DEFAULT_APP_API_PREFIX,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_RUNTIME,
  DEFAULT_RUNTIMES,
  DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS,
  DEFAULT_SHOPIFY_APP_MODES,
  type DEFAULT_SHOPIFY_APP_MODES_VALUES,
} from "@unimolecule/shopify-app-unmanual-app-env/constants";

export {
  DEFAULT_APP_API_PREFIX,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_SHOPIFY_APP_MODES,
};

export type ShopifyAppMode = DEFAULT_SHOPIFY_APP_MODES_VALUES;

export const publicEnv = globalThis.__PUBLIC_ENV__ ?? {
  APP_RUNTIME: DEFAULT_RUNTIME,
  SHOPIFY_APP_FRONTEND_TARGET: DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.FRONTEND,
  SHOPIFY_APP_MODE: DEFAULT_SHOPIFY_APP_MODES.EMBEDDED,
};

/**
 * Returns the current Shopify app mode from the injected public env.
 */
export function getShopifyAppMode() {
  return publicEnv.SHOPIFY_APP_MODE;
}

/**
 * Checks whether browser requests should use standalone account cookies.
 */
export function isStandaloneShopifyAppMode() {
  return getShopifyAppMode() === DEFAULT_SHOPIFY_APP_MODES.STANDALONE;
}

/**
 * Checks whether browser requests should use App Bridge session tokens.
 */
export function isEmbeddedShopifyApp() {
  return publicEnv.SHOPIFY_APP_MODE === DEFAULT_SHOPIFY_APP_MODES.EMBEDDED;
}

/**
 * Checks whether frontend behavior is running against the Node server runtime.
 */
export function isNodeRuntime() {
  return publicEnv.APP_RUNTIME === DEFAULT_RUNTIMES.NODE;
}
