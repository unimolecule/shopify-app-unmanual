import { existsSync } from "node:fs";
import path, { dirname } from "node:path";
import { throwError } from "./utils";

export const root = findWorkspaceRoot();

if (!root) {
  throwError("server-deploy", "Cannot find monorepo root");
}

export const serverDir = path.resolve(root, "apps/server");
export const webDir = path.resolve(root, "apps/web");
export const webDistDir = path.resolve(root, "apps/web/dist");
export const dockerComposePath = path.resolve(serverDir, "docker-compose.yml");
export const nginxConfPath = path.resolve(serverDir, "nginx.conf");
export const wranglerPath = path.resolve(serverDir, "wrangler.json");
export const rootPackagePath = path.resolve(root, "package.json");

/**
 * Routes that must reach Hono before Workers static asset fallback runs.
 */
export const dynamicRoutePatterns = [
  "/api/*",
  "/auth",
  "/auth/*",
  "/webhooks",
  "/webhooks/*",
] as const;

/**
 * Find the workspace root without depending on root-level scripts.
 */
function findWorkspaceRoot(cwd: string = process.cwd()) {
  let currentDir = path.resolve(cwd);

  while (true) {
    if (existsSync(path.join(currentDir, "pnpm-lock.yaml"))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return "";
    }

    currentDir = parentDir;
  }
}
