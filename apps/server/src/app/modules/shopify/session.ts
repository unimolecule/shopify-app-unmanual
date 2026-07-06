import { RequestedTokenType, type Session } from "@shopify/shopify-api";
import { getEnvProvider, getShopifyConfigProvider } from "@/infra/provider";
import { badGatewayError, unauthorizedError } from "@/shared/exceptions";
import { getShopifySessionStorage } from "./session-storage";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

/**
 * Loads the active online session associated with the embedded request.
 */
export async function loadActiveShopifyOnlineSession(
  c: Context<AppEnv>,
): Promise<Session | undefined> {
  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const shopify = await getShopifyConfigProvider(config);
  const sessionStorage = await getShopifySessionStorage(c);
  const sessionId = await shopify.session.getCurrentId({
    isOnline: true,
    rawRequest: c.req.raw,
  });

  const storedSession = sessionId
    ? await sessionStorage.loadSession(sessionId)
    : undefined;

  if (storedSession?.isActive(shopify.config.scopes)) {
    return storedSession;
  }

  return undefined;
}

/**
 * Loads the active offline session for background Shopify Admin work.
 */
export async function loadActiveShopifyOfflineSession(
  c: Context<AppEnv>,
): Promise<Session | undefined> {
  const shopDomain = c.var.shopDomain;
  if (!shopDomain) return undefined;

  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const shopify = await getShopifyConfigProvider(config);
  const sessions = await (
    await getShopifySessionStorage(c)
  ).findSessionsByShop(shopDomain);
  const session = sessions.find(
    (candidate) => !candidate.isOnline && candidate.accessToken,
  );

  if (session?.isActive(shopify.config.scopes)) {
    return session;
  }

  return undefined;
}

/**
 * Exchanges the embedded session token for an online Admin API session.
 */
export function exchangeShopifyOnlineSession(
  c: Context<AppEnv>,
): Promise<Session> {
  return exchangeShopifySession(c, RequestedTokenType.OnlineAccessToken);
}

/**
 * Exchanges the embedded session token for an offline Admin API session.
 */
export function exchangeShopifyOfflineSession(
  c: Context<AppEnv>,
): Promise<Session> {
  return exchangeShopifySession(c, RequestedTokenType.OfflineAccessToken);
}

/**
 * Returns an active offline session, creating one through token exchange when
 * the current embedded request does not have one yet.
 */
export async function ensureShopifyOfflineSession(
  c: Context<AppEnv>,
): Promise<Session> {
  return (
    (await loadActiveShopifyOfflineSession(c)) ??
    (await exchangeShopifyOfflineSession(c))
  );
}

/**
 * Deletes the current online session and exchanges a fresh one.
 */
export async function refreshShopifyOnlineSession(
  c: Context<AppEnv>,
): Promise<Session> {
  await deleteCurrentShopifyOnlineSession(c);
  return exchangeShopifyOnlineSession(c);
}

/**
 * Stores the active Shopify session and access token on the Hono context.
 */
export function setShopifySessionContext(c: Context<AppEnv>, session: Session) {
  if (!session.accessToken) {
    throw unauthorizedError("Shopify session does not have an access token");
  }

  c.set("shopifySession", session);
  c.set("shopifyAccessToken", session.accessToken);
}

/**
 * Deletes any stored online session IDs associated with the current request.
 */
async function deleteCurrentShopifyOnlineSession(c: Context<AppEnv>) {
  const sessionStorage = await getShopifySessionStorage(c);
  const sessionIds = new Set<string>();

  if (c.var.shopifySession?.id) {
    sessionIds.add(c.var.shopifySession.id);
  }

  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const shopify = await getShopifyConfigProvider(config);
  const sessionId = await shopify.session.getCurrentId({
    isOnline: true,
    rawRequest: c.req.raw,
  });

  if (sessionId) {
    sessionIds.add(sessionId);
  }

  await Promise.all(
    Array.from(sessionIds, (id) => sessionStorage.deleteSession(id)),
  );
}

async function exchangeShopifySession(
  c: Context<AppEnv>,
  requestedTokenType: RequestedTokenType,
): Promise<Session> {
  const authHeader = c.req.header("Authorization");
  const sessionToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!sessionToken) {
    throw unauthorizedError("Missing or malformed Authorization header");
  }

  const config = getEnvProvider(c.get("runtimeEnv") ?? c.env);
  const shopify = await getShopifyConfigProvider(config);
  const { session } = await shopify.auth.tokenExchange({
    shop: c.var.shopDomain,
    sessionToken,
    requestedTokenType,
  });

  if (!session.accessToken) {
    throw badGatewayError("Token exchange did not return an access token");
  }

  await (await getShopifySessionStorage(c)).storeSession(session);

  return session;
}
