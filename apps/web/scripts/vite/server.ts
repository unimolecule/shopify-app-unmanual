import { throwAppWebError as throwError } from "../../internal";
import { createViteAllowedHosts } from "./allowed-hosts";
import { createViteProxy } from "./proxy";
import type { ConfigSchema } from "@unimolecule/shopify-app-unmanual-app-env";
import type { ServerOptions } from "vite";

interface CreateViteServerOptions {
  env: ConfigSchema;
  processEnv?: NodeJS.ProcessEnv;
}

/**
 * Creates Vite dev-server options from validated env and Shopify CLI ports.
 */
export function createViteServer({
  env,
  processEnv = process.env,
}: CreateViteServerOptions): ServerOptions {
  // Shopify CLI injects FRONTEND_PORT/BACKEND_PORT during shopify app dev.
  const frontendPort =
    readPort(processEnv.FRONTEND_PORT, "FRONTEND_PORT") ?? env.APP__WEB_PORT;
  const backendPort =
    readPort(processEnv.BACKEND_PORT, "BACKEND_PORT") ?? env.APP__SERVER_PORT;

  return {
    allowedHosts: createViteAllowedHosts({ env, processEnv }),
    port: frontendPort,
    strictPort: true,
    proxy: createViteProxy(backendPort),
  };
}

/**
 * Parses optional port values and fails fast on invalid Shopify CLI input.
 */
function readPort(value: string | undefined, name: string) {
  if (!value) {
    return;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throwError("apps/web", `Invalid ${name}: ${value}`);
  }

  return port;
}
