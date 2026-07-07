import { OpenAPIHono } from "@hono/zod-openapi";
import { onAppError } from "../lifecycle/error";
import { onAppNotFound } from "../lifecycle/not-found";
import { registerMiddleware } from "./register-middleware";
import { registerRoutes, registerRuntimeRoutes } from "./register-routes";
import type { RuntimeCapabilitiesCreator } from "@/shared/middlewares";
import type { AppEnv } from "@/typings";
import type { ReturnOf } from "@unimolecule/utils";

/**
 * Central Hono app factory.
 */
export function createApp(
  options: {
    createRuntimeCapabilities?: RuntimeCapabilitiesCreator;
  } = {},
) {
  const { createRuntimeCapabilities } = options;

  const app = new OpenAPIHono<AppEnv>();

  registerMiddleware(app, {
    createRuntimeCapabilities,
  });

  const appWithRoutes = registerRoutes(app);
  registerRuntimeRoutes(appWithRoutes);

  onAppError(appWithRoutes);
  onAppNotFound(appWithRoutes);

  return appWithRoutes;
}

export type AppApiType = ReturnOf<typeof createApp>;
