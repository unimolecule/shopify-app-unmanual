import { createMiddleware } from "hono/factory";
import {
  exchangeShopifyOnlineSession,
  loadActiveShopifyOnlineSession,
  setShopifySessionContext,
} from "@/app/modules/shopify/session";
import { badGatewayError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";

export const tokenExchange = createMiddleware<AppEnv>(async (c, next) => {
  try {
    const storedSession = await loadActiveShopifyOnlineSession(c);

    if (storedSession) {
      setShopifySessionContext(c, storedSession);
      await next();
      return;
    }

    setShopifySessionContext(c, await exchangeShopifyOnlineSession(c));
  } catch (error) {
    throw badGatewayError("Token exchange failed", {
      details: {
        cause: error,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }

  await next();
});
