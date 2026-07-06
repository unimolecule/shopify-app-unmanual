import { name, version } from "../../../package.json";
import type { AppEnv } from "@/typings";
import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { Schema } from "hono";

export type AppOpenAPI<S extends Schema = {}> = OpenAPIHono<AppEnv, S>;
export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppEnv>;

export function registerOpenAPI(
  app: AppOpenAPI,
  options: {
    enabled?: boolean;
  } = {},
) {
  if (!options.enabled) return;

  app.doc31("/document", {
    openapi: "3.1.0",
    info: {
      title: name,
      version,
    },
  });

  app.get("/openapi", async (c, next) => {
    const { Scalar } = await import("@scalar/hono-api-reference");
    const handler = Scalar<AppEnv>({
      url: "/document",
      theme: "kepler",
      layout: "modern",
      defaultHttpClient: {
        targetKey: "js",
        clientKey: "fetch",
      },
    });

    return handler(c, next);
  });
}
