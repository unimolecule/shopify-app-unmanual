import { getEnvProvider } from "@/infra/provider";
import { internalServerError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";
import type { DEFAULT_SHOPIFY_APP_MODES_VALUES } from "@shamt/app-env";
import type { Session, Shopify } from "@shopify/shopify-api";
import type { Context, MiddlewareHandler } from "hono";

export interface ShopifyModeCapabilities {
  isEmbeddedApp: boolean;
  buildAppShellResponse: (c: Context<AppEnv>) => Promise<Response> | Response;
  renderAppShell: (c: Context<AppEnv>["var"]["runtimeEnv"]) => string;
  authenticateAdminRequest: MiddlewareHandler<AppEnv>;
  refreshAdminSession: (c: Context<AppEnv>) => Promise<Session>;
  buildAuthCallbackRedirect: (
    c: Context<AppEnv>,
    shopify: Shopify,
    session: Session,
    headers: Headers,
  ) => Promise<Response> | Response;
}

export type ShopifyModeCapabilityDisposer = () => Promise<void> | void;

const shopifyModeCapabilities = new Map<
  DEFAULT_SHOPIFY_APP_MODES_VALUES,
  ShopifyModeCapabilities
>();
const shopifyModeCapabilityDisposers = new Map<
  DEFAULT_SHOPIFY_APP_MODES_VALUES,
  ShopifyModeCapabilityDisposer
>();

/**
 * Reads the capability set registered for a Shopify app mode.
 */
export function getShopifyModeCapabilities(
  mode: DEFAULT_SHOPIFY_APP_MODES_VALUES,
): ShopifyModeCapabilities {
  const capabilities = shopifyModeCapabilities.get(mode);

  if (!capabilities) {
    throw internalServerError(`Shopify app mode is not registered: ${mode}`, {
      details: {
        mode,
      },
      expose: true,
    });
  }

  return capabilities;
}

/**
 * Registers the capability set for a Shopify app mode.
 */
export function setShopifyModeCapabilities(
  mode: DEFAULT_SHOPIFY_APP_MODES_VALUES,
  capabilities: ShopifyModeCapabilities,
  disposer: ShopifyModeCapabilityDisposer = () =>
    resetShopifyModeCapability(mode),
): void {
  shopifyModeCapabilities.set(mode, capabilities);
  shopifyModeCapabilityDisposers.set(mode, disposer);
}

/**
 * Removes the capability set and disposer for a Shopify app mode.
 */
export function resetShopifyModeCapability(
  mode: DEFAULT_SHOPIFY_APP_MODES_VALUES,
): void {
  shopifyModeCapabilities.delete(mode);
  shopifyModeCapabilityDisposers.delete(mode);
}

/**
 * Runs all registered Shopify mode disposers and clears the registry.
 */
export async function disposeShopifyModeCapabilities(): Promise<void> {
  const disposers = [...shopifyModeCapabilityDisposers.values()];

  for (const dispose of disposers) {
    await dispose();
  }

  shopifyModeCapabilities.clear();
  shopifyModeCapabilityDisposers.clear();
}

/**
 * Authenticates Admin API requests using the active Shopify mode strategy.
 */
export function shopifyAdminSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
    const capabilities = getShopifyModeCapabilities(config.SHOPIFY_APP_MODE);

    return await capabilities.authenticateAdminRequest(c, next);
  };
}
