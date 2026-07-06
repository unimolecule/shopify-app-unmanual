import { createMiddleware } from "hono/factory";
import { getSafeProcessEnv } from "@/app/runtime/process/node/utils/process";
import { getEnvProvider } from "@/infra/provider";
import { internalServerError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";

export function runtimeEnvMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    try {
      const envConfig = c.env ?? getSafeProcessEnv();
      const runtimeEnv = getEnvProvider(envConfig);
      c.set("runtimeEnv", runtimeEnv);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw internalServerError("runtime env errors", {
        details: { cause: error, message },
        expose: true,
      });
    }

    await next();
  });
}
