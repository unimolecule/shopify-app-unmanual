import {
  configSchema,
  DEFAULT_RUNTIMES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { executeCommand } from "@unimolecule/utils/node";
import { throwRepositoryError as throwError } from "../utils";

/**
 * Dispatch the runtime-specific deployment owned by apps/server.
 */
async function main() {
  const config = configSchema.parse(process.env);

  if (config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE) {
    await executeCommand("pnpm", ["--dir", "apps/server", "run", "cf:deploy"]);
    return;
  }

  if (config.APP_RUNTIME === DEFAULT_RUNTIMES.NODE) {
    await executeCommand("pnpm", [
      "--dir",
      "apps/server",
      "run",
      "node:deploy",
    ]);
    return;
  }

  throwError(`Unsupported APP_RUNTIME: ${config.APP_RUNTIME}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
