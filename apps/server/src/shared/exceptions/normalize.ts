import { HttpRequestError } from "@unimolecule/oh-my-fetch/errors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "@/shared/models";
import {
  badGatewayError,
  internalServerError,
  timeoutError,
  unprocessableEntityError,
} from "./errors";
import { normalizeShopifyError } from "./shopify";

/**
 * Convert any thrown value into AppError before building the HTTP response.
 * Use only from global error handling; business code should throw AppError helpers directly.
 */
export function normalizeError(error: unknown): AppError {
  const shopifyError = normalizeShopifyError(error);
  if (shopifyError) return shopifyError;

  if (error instanceof HttpRequestError) {
    return normalizeHttpRequestError(error);
  }

  if (error instanceof ZodError) {
    return unprocessableEntityError("Validation failed", {
      details: {
        cause: error,
        issues: error.issues,
      },
    });
  }

  if (error instanceof AppError) return error;

  if (error instanceof HTTPException) {
    return new AppError({
      status: error.status,
      message: error.message,
      expose: error.status < 500,
      details: { cause: error },
    });
  }

  return internalServerError("Unhandled application error", {
    details: {
      cause: error,
      ...getUnknownErrorDetails(error),
    },
  });
}

/**
 * Map transport-layer request errors into the application exception model.
 * Upstream failures should not leak raw response bodies in production.
 */
function normalizeHttpRequestError(error: HttpRequestError): AppError {
  const details = {
    kind: error.kind,
    code: error.code,
    status: error.status,
    data: error.data,
    config: error.config,
    cause: error,
  };

  if (error.kind === "timeout" || error.kind === "abort") {
    return timeoutError(error.message, { details });
  }

  if (error.kind === "request_validation") {
    return internalServerError("Invalid upstream request", { details });
  }

  return badGatewayError(error.message || "Upstream request failed", {
    details,
  });
}

/**
 * Extract safe debug metadata from an unknown runtime error.
 * The returned object is stored under details and is not exposed in production.
 */
function getUnknownErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
}
