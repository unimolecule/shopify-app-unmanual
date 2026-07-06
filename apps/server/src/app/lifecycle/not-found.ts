import { createErrorResponse, notFoundError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";
import type { Hono } from "hono";

export function onAppNotFound(app: Hono<AppEnv>) {
  app.notFound((c) =>
    createErrorResponse(
      c,
      notFoundError(`Route not found: ${c.req.method} ${c.req.path}`),
    ),
  );
}
