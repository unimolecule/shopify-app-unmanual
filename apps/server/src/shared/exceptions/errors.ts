import { HTTP_STATUS_CODES } from "@unimolecule/canon/http";
import { AppError, type AppErrorOptions } from "@/shared/models";

type ErrorOptions = Omit<AppErrorOptions, "message" | "status">;

/**
 * Create an AppError with a fixed HTTP status.
 * Prefer the exported status-specific helpers below in business code.
 */
function createHttpError(
  status: number,
  message: string,
  options: ErrorOptions = {},
) {
  return new AppError({
    ...options,
    status,
    message,
  });
}

/**
 * Use when the request input is invalid, for example missing query params.
 * Example: throw badRequestError("Invalid shop domain");
 */
export function badRequestError(
  message: string = HTTP_STATUS_CODES.BAD_REQUEST.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.BAD_REQUEST.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when authentication fails or a token/signature is invalid.
 * Example: throw unauthorizedError("Invalid session token");
 */
export function unauthorizedError(
  message: string = HTTP_STATUS_CODES.UNAUTHORIZED.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.UNAUTHORIZED.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when the caller is authenticated but not allowed to access the resource.
 * Example: throw forbiddenError("Shop does not have permission");
 */
export function forbiddenError(
  message: string = HTTP_STATUS_CODES.FORBIDDEN.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.FORBIDDEN.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when a route or domain resource cannot be found.
 * Example: throw notFoundError("Product not found");
 */
export function notFoundError(
  message: string = HTTP_STATUS_CODES.NOT_FOUND.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.NOT_FOUND.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when a resource used to exist but is no longer available.
 * Example: throw goneError("File expired");
 */
export function goneError(
  message: string = HTTP_STATUS_CODES.GONE.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.GONE.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when a request times out before the operation can complete.
 * Example: throw timeoutError("Shopify request timed out");
 */
export function timeoutError(
  message: string = HTTP_STATUS_CODES.REQUEST_TIMEOUT.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.REQUEST_TIMEOUT.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when the requested state conflicts with an existing resource.
 * Example: throw conflictError("OAuth state already consumed");
 */
export function conflictError(
  message: string = HTTP_STATUS_CODES.CONFLICT.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.CONFLICT.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when the request payload exceeds the allowed size.
 * Example: throw payloadTooLargeError("Request payload too large", { details });
 */
export function payloadTooLargeError(
  message: string = HTTP_STATUS_CODES.REQUEST_TOO_LONG.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.REQUEST_TOO_LONG.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use for upload-specific payload size failures.
 * Example: throw uploadPayloadTooLargeError("Upload payload too large", { details });
 */
export const uploadPayloadTooLargeError = payloadTooLargeError;

/**
 * Use when parsed input fails validation, including Zod validation errors.
 * Example: throw unprocessableEntityError("Validation failed", { details });
 */
export function unprocessableEntityError(
  message: string = HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use when the caller exceeds a rate limit.
 * Example: throw rateLimitError("Too many webhook retries");
 */
export function rateLimitError(
  message: string = HTTP_STATUS_CODES.TOO_MANY_REQUESTS.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.TOO_MANY_REQUESTS.code, message, {
    ...options,
    expose: options?.expose ?? true,
  });
}

/**
 * Use for internal runtime errors. 5xx details are hidden in production unless expose is true.
 * Put the original error in details.cause, not as a top-level cause.
 */
export function internalServerError(
  message: string = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(
    HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR.code,
    message,
    {
      ...options,
      expose: options?.expose ?? false,
    },
  );
}

/**
 * Use when an upstream service fails, such as Shopify Admin API or token exchange.
 * Example: throw badGatewayError("Token exchange failed", { details: { cause: error } });
 */
export function badGatewayError(
  message: string = HTTP_STATUS_CODES.BAD_GATEWAY.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.BAD_GATEWAY.code, message, {
    ...options,
    expose: options?.expose ?? false,
  });
}

/**
 * Use when a dependency is temporarily unavailable.
 * Example: throw serviceUnavailableError("Cache service unavailable");
 */
export function serviceUnavailableError(
  message: string = HTTP_STATUS_CODES.SERVICE_UNAVAILABLE.phrase,
  options?: ErrorOptions,
) {
  return createHttpError(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE.code, message, {
    ...options,
    expose: options?.expose ?? false,
  });
}
