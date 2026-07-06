import { OpenAPIHono } from "@hono/zod-openapi";
import { onAppError } from "../lifecycle/error";
import { onAppNotFound } from "../lifecycle/not-found";
import { registerMiddleware } from "./register-middleware";
import { registerRoutes } from "./register-routes";
import type { RuntimeCapabilitiesCreator } from "@/shared/middlewares";
import type { AppEnv } from "@/typings";

/**
 * Central Hono app factory.
 */
export function createApp(
  options: {
    createRuntimeCapabilities?: RuntimeCapabilitiesCreator;
  } = {},
) {
  const app = new OpenAPIHono<AppEnv>();

  registerMiddleware(app, {
    createRuntimeCapabilities: options.createRuntimeCapabilities,
  });
  registerRoutes(app);
  onAppError(app);
  onAppNotFound(app);

  return app;
}
