import { DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS } from "@unimolecule/shopify-app-unmanual-app-env";
import { getEnvProvider } from "@/infra/provider";
import { getShopifyModeCapabilities } from "../mode";
import { getShopifyAppShellUrl } from "./urls";
import type { AppEnv } from "@/typings";
import type { Context, Hono } from "hono";

/**
 * Registers app shell routes that delegate rendering to the active Shopify app mode.
 */
export const registerAppShellRoutes = (app: Hono<AppEnv>) => {
  app.get("/app", renderAppShellResponse);
  app.get("/app/*", renderAppShellResponse);
  app.get("/", renderAppShellResponse);
};

/**
 * Builds the app shell response for the current embedded or standalone mode.
 */
function renderAppShellResponse(c: Context<AppEnv>) {
  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);

  if (
    config.SHOPIFY_APP_FRONTEND_TARGET ===
    DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.FRONTEND
  ) {
    return c.redirect(getShopifyAppShellUrl(config));
  }

  return getShopifyModeCapabilities(
    config.SHOPIFY_APP_MODE,
  ).buildAppShellResponse(c);
}
