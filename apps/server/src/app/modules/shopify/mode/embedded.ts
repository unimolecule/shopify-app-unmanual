import { createMiddleware } from "hono/factory";
import { getEnvProvider } from "@/infra/provider";
import {
  tokenExchange,
  verifySessionToken,
} from "@/shared/middlewares/shopify";
import { renderEmbeddedAppShell } from "../app-shell/templates";
import { getShopifyAppShellUrl } from "../app-shell/urls";
import { refreshShopifyOnlineSession } from "../session";
import type { ShopifyModeCapabilities } from "./capabilities";
import type { AppEnv } from "@/typings";

/**
 * Defines the Shopify app-mode behavior for embedded Admin iframe requests.
 */
export const embeddedShopifyModeCapabilities: ShopifyModeCapabilities = {
  isEmbeddedApp: true,
  // Embedded apps render the shell that can initialize inside Shopify Admin.
  buildAppShellResponse: (c) =>
    c.html(
      renderEmbeddedAppShell(getEnvProvider(c.get("runtimeEnv") ?? c.env)),
    ),
  renderAppShell: renderEmbeddedAppShell,
  // Admin API requests must first prove the App Bridge session token.
  authenticateAdminRequest: createMiddleware<AppEnv>(async (c, next) => {
    await verifySessionToken(c, async () => {
      await tokenExchange(c, next);
    });
  }),
  refreshAdminSession: refreshShopifyOnlineSession,
  // OAuth callbacks prefer Shopify Admin when host is present, then shell owner.
  buildAuthCallbackRedirect: (c, shopify, session, headers) => {
    const responseHeaders = new Headers(headers);
    const host = c.req.query("host");

    if (host) {
      responseHeaders.set("Location", shopify.auth.buildEmbeddedAppUrl(host));
    } else {
      // Without a Shopify Admin host, fall back to the configured app shell
      // owner: /app when server owns the frontend role, / when web owns it.
      responseHeaders.set(
        "Location",
        getShopifyAppShellUrl(getEnvProvider(c.get("runtimeEnv") ?? c.env), {
          shop: session.shop,
        }),
      );
    }

    return new Response(null, {
      status: 302,
      statusText: "Found",
      headers: responseHeaders,
    });
  },
};
