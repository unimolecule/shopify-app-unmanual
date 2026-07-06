import {
  CookieNotFound,
  GraphqlQueryError,
  HttpMaxRetriesError,
  HttpResponseError,
  HttpRetriableError,
  HttpThrottlingError,
  InvalidHmacError,
  InvalidHostError,
  InvalidJwtError,
  InvalidOAuthError,
  InvalidSession,
  InvalidShopError,
  InvalidWebhookError,
  MissingJwtTokenError,
  SessionStorageError,
  ShopifyError,
} from "@shopify/shopify-api";
import {
  badGatewayError,
  internalServerError,
  rateLimitError,
  serviceUnavailableError,
  unauthorizedError,
} from "./errors";
import type { AppError } from "@/shared/models";

/**
 * Maps Shopify App JS errors into the app-wide HTTP error model.
 */
export function normalizeShopifyError(error: unknown): AppError | undefined {
  if (isShopifyAuthError(error)) {
    return unauthorizedError("Shopify authorization is required", {
      details: createShopifyErrorDetails(error),
    });
  }

  if (isShopifyWebhookError(error)) {
    return unauthorizedError("Invalid Shopify webhook request", {
      details: createShopifyErrorDetails(error),
    });
  }

  if (error instanceof HttpThrottlingError) {
    return rateLimitError("Shopify API rate limit exceeded", {
      details: createShopifyErrorDetails(error),
      headers: createRetryAfterHeaders(error),
    });
  }

  if (
    error instanceof HttpRetriableError ||
    error instanceof HttpMaxRetriesError
  ) {
    return serviceUnavailableError("Shopify API is temporarily unavailable", {
      details: createShopifyErrorDetails(error),
    });
  }

  if (
    error instanceof HttpResponseError ||
    error instanceof GraphqlQueryError
  ) {
    return badGatewayError("Shopify API request failed", {
      details: createShopifyErrorDetails(error),
    });
  }

  if (error instanceof SessionStorageError) {
    return serviceUnavailableError("Shopify session storage is unavailable", {
      details: createShopifyErrorDetails(error),
    });
  }

  if (error instanceof ShopifyError) {
    return internalServerError("Shopify app error", {
      details: createShopifyErrorDetails(error),
    });
  }

  return undefined;
}

function isShopifyAuthError(error: unknown) {
  return (
    error instanceof InvalidSession ||
    error instanceof InvalidJwtError ||
    error instanceof MissingJwtTokenError ||
    error instanceof CookieNotFound ||
    error instanceof InvalidOAuthError ||
    error instanceof InvalidShopError ||
    error instanceof InvalidHostError
  );
}

function isShopifyWebhookError(error: unknown) {
  return (
    error instanceof InvalidHmacError || error instanceof InvalidWebhookError
  );
}

function createRetryAfterHeaders(error: HttpThrottlingError) {
  const retryAfter = error.response.retryAfter;

  if (!retryAfter) {
    return;
  }

  return {
    "Retry-After": String(retryAfter),
  };
}

function createShopifyErrorDetails(error: ShopifyError) {
  return {
    cause: error,
    name: error.name,
    message: error.message,
    response: getShopifyErrorResponseDetails(error),
    graphql:
      error instanceof GraphqlQueryError
        ? {
            body: error.body,
            headers: error.headers,
            response: error.response,
          }
        : undefined,
  };
}

function getShopifyErrorResponseDetails(error: ShopifyError) {
  if (error instanceof HttpResponseError) {
    return {
      body: error.response.body,
      code: error.response.code,
      headers: error.response.headers,
      statusText: error.response.statusText,
    };
  }

  if (error instanceof InvalidWebhookError) {
    return getInvalidWebhookResponseDetails(error.response);
  }
}

function getInvalidWebhookResponseDetails(response: unknown) {
  if (response instanceof Response) {
    return {
      code: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      statusText: response.statusText,
    };
  }

  if (response && typeof response === "object") {
    const value = response as {
      headers?: unknown;
      statusCode?: unknown;
      statusText?: unknown;
    };

    return {
      code: value.statusCode,
      headers: value.headers,
      statusText: value.statusText,
    };
  }

  return;
}
