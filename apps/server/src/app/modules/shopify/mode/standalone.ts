import { createMiddleware } from "hono/factory";
import { getEnvProvider } from "@/infra/provider";
import { unauthorizedError } from "@/shared/exceptions";
import {
  commitShopifyAccountSession,
  createShopifyAccountSession,
  hasShopifyAccountSession,
  loadShopifySessionForAccount,
} from "../account/session";
import { renderStandaloneAppShell } from "../app-shell/templates";
import { getShopifyAppShellUrl } from "../app-shell/urls";
import { setShopifySessionContext } from "../session";
import type { ShopifyModeCapabilities } from "./capabilities";
import type { AppEnv } from "@/typings";

/**
 * Defines the Shopify app-mode behavior for standalone browser requests.
 */
export const standaloneShopifyModeCapabilities: ShopifyModeCapabilities = {
  isEmbeddedApp: false,
  // Standalone shells bootstrap account-cookie auth before rendering the app.
  buildAppShellResponse: (c) => {
    const shop = c.req.query("shop");
    const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);

    if (!hasShopifyAccountSession(c) && shop) {
      const authUrl = new URL("/auth", config.SHOPIFY_APP_URL);
      authUrl.searchParams.set("shop", shop);

      return c.redirect(authUrl.toString());
    }

    return c.html(renderStandaloneAppShell(config));
  },
  renderAppShell: renderStandaloneAppShell,
  // Standalone Admin API requests rely on the account session cookie.
  authenticateAdminRequest: createMiddleware<AppEnv>(async (c, next) => {
    const session = await loadShopifySessionForAccount(c);
    c.set("shopDomain", session.shop);
    setShopifySessionContext(c, session);
    await next();
  }),
  // Expired standalone cookies must restart OAuth instead of token exchange.
  refreshAdminSession: () => {
    throw unauthorizedError(
      "Standalone Shopify session expired or was revoked",
    );
  },
  // OAuth callbacks persist the account session before returning to the shell.
  buildAuthCallbackRedirect: (c, _shopify, session, headers) => {
    const responseHeaders = new Headers(headers);
    responseHeaders.append(
      "Set-Cookie",
      commitShopifyAccountSession(c, createShopifyAccountSession(session)),
    );
    // Standalone returns to the app shell owner after the account cookie is set.
    // The helper keeps /app for backend-owned shells and / for web-owned shells.
    responseHeaders.set(
      "Location",
      getShopifyAppShellUrl(getEnvProvider(c.get("runtimeEnv") ?? c.env)),
    );

    return new Response(null, {
      status: 302,
      statusText: "Found",
      headers: responseHeaders,
    });
  },
};
