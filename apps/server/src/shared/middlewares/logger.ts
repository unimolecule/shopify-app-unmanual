import { createMiddleware } from "hono/factory";
import type { AppEnv } from "@/typings";

export const LogPrefix = {
  Incoming: "👈 req 👈",
  Outgoing: "👉 res 👉",
  Error: "❌ err ❌",
} as const;

type LoggerMiddlewareOptions = {
  ignorePaths?: string[];
};

export function loggerMiddleware(options: LoggerMiddlewareOptions = {}) {
  const ignorePaths = new Set(options.ignorePaths);

  return createMiddleware<AppEnv>(async (c, next) => {
    const { method: requestMethod, path: requestPath } = c.req;
    if (ignorePaths.has(requestPath)) {
      await next();
      return;
    }

    const logger = c.get("runtimeLogger");
    const requestId = c.get("requestId");
    const start = performance.now();

    logger.info(
      `[${LogPrefix.Incoming} ${requestId}] ${requestMethod} ${requestPath}`,
    );

    try {
      await next();
    } catch (error) {
      const durationMs = performance.now() - start;
      logger.error(
        `[${LogPrefix.Error} ${requestId}] ${requestMethod} ${requestPath} ${durationMs.toFixed(2)}ms`,
      );
      throw error;
    }

    const durationMs = performance.now() - start;

    logger.info(
      `[${LogPrefix.Outgoing} ${requestId}] ${requestMethod} ${requestPath} ${c.res.status} ${durationMs.toFixed(2)}ms`,
    );
  });
}
