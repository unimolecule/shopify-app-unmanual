import { Hono } from "hono";
import { getEnvProvider, getShopifyConfigProvider } from "@/infra/provider";
import { badRequestError } from "@/shared/exceptions";
import { getShopifyModeCapabilities } from "../mode";
import { getShopifySessionStorage } from "../session-storage";
import type { AppEnv } from "@/typings";

const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/**
 * Creates Shopify OAuth routes for install, reauthorization, and callbacks.
 */
export const createAuthRoutes = () => {
  const authRoutes = new Hono<AppEnv>();

  authRoutes.get("/", async (c) => {
    const shop = c.req.query("shop");
    const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
    const shopify = await getShopifyConfigProvider(config);

    if (!shop || !SHOP_DOMAIN_RE.test(shop)) {
      throw badRequestError("Invalid or missing shop parameter");
    }

    return shopify.auth.begin({
      shop,
      callbackPath: "/auth/callback",
      isOnline: false,
      rawRequest: c.req.raw,
    });
  });

  authRoutes.get("/callback", async (c) => {
    const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
    const shopify = await getShopifyConfigProvider(config);
    const { headers, session } = await shopify.auth.callback({
      rawRequest: c.req.raw,
    });

    await (await getShopifySessionStorage(c)).storeSession(session);

    return getShopifyModeCapabilities(
      config.SHOPIFY_APP_MODE,
    ).buildAuthCallbackRedirect(c, shopify, session, new Headers(headers));
  });

  return authRoutes;
};

/**
 * Mounts Shopify OAuth routes under the app-level auth prefix.
 */
export const registerAuthRoutes = (app: Hono<AppEnv>) => {
  app.route("/auth", createAuthRoutes());
};
