import { DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS } from "@shamt/app-env";
import type { RuntimeConfig } from "@/infra/env";

type ShopifyAppShellUrlConfig = Pick<
  RuntimeConfig,
  "SHOPIFY_APP_FRONTEND_TARGET" | "SHOPIFY_APP_URL"
>;

/**
 * Returns the route that owns the app shell for the active frontend target.
 */
export function getShopifyAppShellPath(config: ShopifyAppShellUrlConfig) {
  return config.SHOPIFY_APP_FRONTEND_TARGET ===
    DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.FRONTEND
    ? "/"
    : "/app";
}

/**
 * Builds OAuth fallback URLs without coupling mode capabilities to a shell owner.
 */
export function getShopifyAppShellUrl(
  config: ShopifyAppShellUrlConfig,
  searchParams: Record<string, string | undefined> = {},
) {
  const url = new URL(getShopifyAppShellPath(config), config.SHOPIFY_APP_URL);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
