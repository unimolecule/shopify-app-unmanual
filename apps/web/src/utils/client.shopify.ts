import {
  isEmbeddedShopifyApp,
  isStandaloneShopifyAppMode,
} from "@/utils/public-env";
import { throwAppWebError as throwError } from "../../internal";
import { createClient, HttpRequestError } from "./client";
import type { HttpRequestConfig } from "@unimolecule/oh-my-fetch";

export class ShopifyAuthRedirectError extends Error {
  override name = "ShopifyAuthRedirectError";
}

let sessionTokenPromise: Promise<string> | undefined;
let authRedirectState:
  | {
      shop: string;
      startedAt: number;
    }
  | undefined;

const AUTH_REDIRECT_THROTTLE_MS = 3000;

const client = createClient();

export const shopifyClient = client.extend({
  hooks: {
    beforeRequest: async (config) => {
      return {
        ...config,
        credentials: isStandaloneShopifyAppMode() ? "include" : "same-origin",
        headers: await getShopifyApiHeaders(config.headers),
      };
    },
    afterResponse: (response) => {
      resetAuthRedirectState();
      return response;
    },
    beforeError: (error) => {
      if (error instanceof HttpRequestError && error.status === 401) {
        redirectToAuth();
        return new ShopifyAuthRedirectError(
          "Shopify authorization is required",
          {
            cause: error,
          },
        );
      }

      return error;
    },
  },
});

/**
 * Builds mode-specific headers for embedded App Bridge or standalone cookies.
 */
async function getShopifyApiHeaders(headersInit: HttpRequestConfig["headers"]) {
  const headers = createHeaders(headersInit);

  if (isEmbeddedShopifyApp()) {
    headers.set("Authorization", `Bearer ${await getSessionToken()}`);
  }

  return headers;
}

function createHeaders(headersInit: HttpRequestConfig["headers"]) {
  if (!headersInit) {
    return new Headers();
  }

  if (headersInit instanceof Headers || Array.isArray(headersInit)) {
    return new Headers(headersInit);
  }

  const headers = new Headers();

  Object.entries(headersInit).forEach(([key, value]) => {
    if (value !== undefined) {
      headers.set(key, value);
    }
  });

  return headers;
}

/**
 * Reuses an in-flight App Bridge token request to avoid duplicate work.
 */
function getSessionToken() {
  sessionTokenPromise ??= readSessionToken().finally(() => {
    sessionTokenPromise = undefined;
  });

  return sessionTokenPromise;
}

/**
 * Reads a fresh embedded session token from Shopify App Bridge.
 */
function readSessionToken() {
  const idToken = globalThis.shopify?.idToken;

  if (!idToken) {
    throwError("Shopify App Bridge session token API is unavailable");
  }

  return idToken();
}

/**
 * Redirects to OAuth once per shop within the throttle window.
 */
function redirectToAuth() {
  const shop = new URLSearchParams(globalThis.location.search).get("shop");

  if (!shop) {
    return;
  }

  const now = Date.now();

  if (
    authRedirectState?.shop === shop &&
    now - authRedirectState.startedAt < AUTH_REDIRECT_THROTTLE_MS
  ) {
    return;
  }

  authRedirectState = { shop, startedAt: now };

  const authUrl = new URL("/auth", globalThis.location.origin);
  authUrl.searchParams.set("shop", shop);
  globalThis.open(authUrl.toString(), "_top");
}

/**
 * Allows future 401 responses to start a new auth redirect.
 */
function resetAuthRedirectState() {
  authRedirectState = undefined;
}
