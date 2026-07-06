import { every } from "hono/combine";
import { createMiddleware } from "hono/factory";
import { timeoutMiddleware } from "./timeout";
import { uploadMiddleware } from "./upload";
import type { AppEnv } from "@/typings";

export type RequestPolicy = {
  bodyLimit?: {
    maxSize: number;
  };
  method: string;
  path: string;
  timeout: {
    message?: string;
    ms: number;
  };
};

export type RequestMiddlewareConfig = {
  apiPrefix: string;
  defaultTimeout: {
    ms: number;
  };
  policies: RequestPolicy[];
};

/**
 * Dispatch request-level timeout and body limit by exact method and path.
 */
export function requestMiddleware(config: RequestMiddlewareConfig) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const policy = getRequestPolicy(config, c.req.method, c.req.path);

    if (!policy) {
      if (isApiPath(config.apiPrefix, c.req.path)) {
        await every(timeoutMiddleware(config.defaultTimeout.ms))(c, next);
        return;
      }

      await next();
      return;
    }

    const middlewares = [
      timeoutMiddleware(policy.timeout.ms, policy.timeout.message),
      ...(policy.bodyLimit ? [uploadMiddleware(policy.bodyLimit.maxSize)] : []),
    ];

    await every(...middlewares)(c, next);
  });
}

function getRequestPolicy(
  config: RequestMiddlewareConfig,
  method: string,
  path: string,
): RequestPolicy | undefined {
  return config.policies.find(
    (policy) =>
      policy.method.toUpperCase() === method.toUpperCase() &&
      policy.path === path,
  );
}

function isApiPath(apiPrefix: string, path: string): boolean {
  return path === apiPrefix || path.startsWith(`${apiPrefix}/`);
}
