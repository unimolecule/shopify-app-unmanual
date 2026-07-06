import { createProcessGracefulExit } from "@unimolecule/utils/node";
import { getLoggerProvider } from "@/infra/provider";
import { onAppShutdown } from "./lifecycle/shutdown";
import type { AppEnv } from "@/typings";
import type { ServerType } from "@hono/node-server";
import type { Hono } from "hono";

/**
 * Register global exception handlers for uncaught errors
 */
export async function registerProcessExits(app: ServerType | Hono<AppEnv>) {
  const logger = await getLoggerProvider();
  const gracefulExit = createProcessGracefulExit(logger);
  const cleanup = gracefulExit.createCleanup(
    app as any,
    async () => await onAppShutdown(),
  );

  gracefulExit.register(cleanup);
}
