import { DEFAULT_ENVS } from "@shamt/app-env";
import { HTTP_STATUS_CODES } from "@unimolecule/canon/http";
import { getEnvProvider } from "@/infra/provider";
import {
  createError,
  type AppError,
  type ErrorResponse,
} from "@/shared/models";
import { setResponseHeaders } from "@/utils";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Build the final JSON error response for Hono.
 * Use from app.onError/app.notFound after the error has been normalized to AppError.
 */
export function createErrorResponse(c: Context<AppEnv>, error: AppError) {
  const requestId = c.get("requestId");
  const body = createError({
    status: error.status,
    message: getPublicMessage(error),
    data: error.data,
    details: shouldExposeDetails(c) ? error.details : undefined,
    requestId,
  }) satisfies ErrorResponse;

  if (error.headers) setResponseHeaders(c, error.headers);

  return c.json(body, error.status as ContentfulStatusCode);
}

/**
 * Decide which message is safe to return to the client.
 * Non-exposed 5xx errors return the HTTP status phrase in production.
 */
function getPublicMessage(error: AppError): string {
  if (error.expose) return error.message;
  return getStatusPhrase(error.status);
}

/**
 * Resolve the standard HTTP phrase for a status code.
 */
function getStatusPhrase(status: number): string {
  const match = Object.values(HTTP_STATUS_CODES).find(
    (statusCode) => statusCode.code === status,
  );
  return match?.phrase ?? HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR.phrase;
}

/**
 * Expose details only outside production. If the environment cannot be resolved,
 * keep details hidden by default.
 */
function shouldExposeDetails(c: Context<AppEnv>): boolean {
  try {
    return (
      getEnvProvider(c.get("runtimeEnv") ?? c.env).APP_ENV !==
      DEFAULT_ENVS.PRODUCTION
    );
  } catch {
    const runtimeEnv = c.get("runtimeEnv");
    if (runtimeEnv?.APP_ENV) {
      return runtimeEnv.APP_ENV !== DEFAULT_ENVS.PRODUCTION;
    }

    const rawEnv = c.env as unknown as Record<string, unknown> | undefined;
    if (rawEnv?.APP_ENV) return rawEnv.APP_ENV !== DEFAULT_ENVS.PRODUCTION;
  }

  return false;
}
