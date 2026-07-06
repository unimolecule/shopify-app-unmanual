import { requestId } from "hono/request-id";
// import { compress } from "hono/compress";
import { trimTrailingSlash } from "hono/trailing-slash";
import { getEnvProvider } from "@/infra/provider";
import {
  emojiFaviconMiddleware,
  loggerMiddleware,
  requestMiddleware,
  runtimeCapabilitiesMiddleware,
  runtimeEnvMiddleware,
  runtimeLoggerMiddleware,
  type RuntimeCapabilitiesCreator,
} from "@/shared/middlewares";
import type { AppEnv } from "@/typings";
import type { Hono } from "hono";

/**
 * Global middleware registration.
 */
export function registerMiddleware(
  app: Hono<AppEnv>,
  options: {
    createRuntimeCapabilities?: RuntimeCapabilitiesCreator;
  } = {},
) {
  const env = getEnvProvider();
  const apiPrefix = `/${env.APP_API_PREFIX}`;
  const apiFilesPath = `${apiPrefix}/files`;

  app.use(emojiFaviconMiddleware("⚡️"));
  app.use(trimTrailingSlash());
  app.use("*", requestId());
  app.use("*", runtimeEnvMiddleware());
  app.use("*", runtimeLoggerMiddleware());
  app.use(
    "*",
    runtimeCapabilitiesMiddleware(options.createRuntimeCapabilities),
  );
  app.use(
    /** must be after runtimeLoggerMiddleware, avoid logger reset */
    loggerMiddleware({
      ignorePaths: ["/favicon.ico", "/public", "/", "/reference", "/document"],
    }),
  );
  app.use(
    "*",
    requestMiddleware({
      apiPrefix,
      defaultTimeout: {
        ms: env.APP_REQUEST_TIMEOUT,
      },
      policies: [
        {
          bodyLimit: {
            maxSize: env.APP_FILE_MAX_SIZE * env.APP_FILE_UPLOAD_MULTIPLE_SIZE,
          },
          method: "POST",
          path: apiFilesPath,
          timeout: {
            message: "Upload request timed out",
            ms: env.APP_FILE_UPLOAD_TIMEOUT,
          },
        },
      ],
    }),
  );
  // app.use(compress()); // if nginx config this is not required
}
