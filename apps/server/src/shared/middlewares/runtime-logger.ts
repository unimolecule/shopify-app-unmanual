import { createMiddleware } from "hono/factory";
import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import { internalServerError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";

export function runtimeLoggerMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    try {
      const runtimeEnv = getEnvProvider(c.env);
      const runtimeLogger = await getLoggerProvider(runtimeEnv);
      c.set("runtimeLogger", runtimeLogger);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw internalServerError("runtime logger errors", {
        details: { cause: error, message },
        expose: true,
      });
    }

    await next();
  });
}
