import {
  DEFAULT_APP_ACCOUNT_SESSION_COOKIE,
  DEFAULT_APP_ACCOUNT_SESSION_EXPIRE,
} from "@/constants";
import { getEnvProvider, getShopifyConfigProvider } from "@/infra/provider";
import { unauthorizedError } from "@/shared/exceptions";
import { getShopifySessionStorage } from "../session-storage";
import type { AppEnv } from "@/typings";
import type { Session } from "@shopify/shopify-api";
import type { Context } from "hono";

export interface ShopifyAccountSession {
  id: string;
  shop: string;
  shopifySessionId: string;
}

/**
 * Checks whether the standalone app account cookie is present on the request.
 */
export function hasShopifyAccountSession(c: Context<AppEnv>): boolean {
  return Boolean(getAccountSessionCookie(c));
}

/**
 * Creates the app-level account session record backed by a stored Shopify session.
 */
export function createShopifyAccountSession(
  session: Session,
): ShopifyAccountSession {
  return {
    id: session.id,
    shop: session.shop,
    shopifySessionId: session.id,
  };
}

/**
 * Serializes the account session cookie used by standalone app mode.
 */
export function commitShopifyAccountSession(
  c: Context<AppEnv>,
  accountSession: ShopifyAccountSession,
): string {
  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const secure =
    new URL(config.SHOPIFY_APP_URL).protocol === "https:" ? "; Secure" : "";

  return (
    [
      `${DEFAULT_APP_ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(accountSession.id)}`,
      `Max-Age=${DEFAULT_APP_ACCOUNT_SESSION_EXPIRE}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
    ].join("; ") + secure
  );
}

/**
 * Loads the Shopify API session associated with the current app account session.
 */
export async function loadShopifySessionForAccount(
  c: Context<AppEnv>,
): Promise<Session> {
  const accountSessionId = getAccountSessionCookie(c);

  if (!accountSessionId) {
    throw unauthorizedError("Missing app account session");
  }

  const session = await (
    await getShopifySessionStorage(c)
  ).loadSession(accountSessionId);
  if (!session?.accessToken) {
    throw unauthorizedError("Invalid app account session");
  }

  const shopify = await getShopifyConfigProvider(
    getEnvProvider(c.get("runtimeEnv") ?? c.env),
  );
  if (!session.isActive(shopify.config.scopes)) {
    throw unauthorizedError("Inactive app account session");
  }

  return session;
}

/**
 * Reads the account session cookie without relying on RFC-restricted cookie names.
 */
function getAccountSessionCookie(c: Context<AppEnv>): string | undefined {
  const cookieHeader = c.req.header("Cookie");
  if (!cookieHeader) return undefined;

  const prefix = `${DEFAULT_APP_ACCOUNT_SESSION_COOKIE}=`;
  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  if (!cookie) return undefined;

  return decodeURIComponent(cookie.slice(prefix.length));
}
