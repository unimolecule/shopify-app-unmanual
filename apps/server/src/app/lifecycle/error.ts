import { serializeValue } from "@unimolecule/utils";
import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import { normalizeError } from "@/shared/exceptions";
import { createErrorResponse } from "@/shared/exceptions/response";
import type { AppError } from "@/shared/models";
import type { AppEnv } from "@/typings";
import type { Context, Hono } from "hono";

export function onAppError(app: Hono<AppEnv>) {
  app.onError(async (error, c) => {
    const appError = normalizeError(error);
    await logError(c, appError);
    return createErrorResponse(c, appError);
  });
}

async function logError(c: Context<AppEnv>, error: AppError) {
  const record = {
    code: error.code,
    message: error.message,
    details: error.details,
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
  };
  const logger = await getErrorLogger(c);

  logger.error(serializeValue(record));
}

async function getErrorLogger(c: Context<AppEnv>) {
  try {
    return await getLoggerProvider(
      getEnvProvider(c.get("runtimeEnv") ?? c.env),
    );
  } catch {
    return getLoggerProvider();
  }
}
