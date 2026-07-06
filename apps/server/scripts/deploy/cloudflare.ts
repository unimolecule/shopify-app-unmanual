import { executeCommand } from "@unimolecule/utils/node";
import {
  dynamicRoutePatterns,
  serverDir,
  webDir,
  webDistDir,
  wranglerPath,
} from "./constants";
import { readJsonFile, writeJsonFile } from "./utils";

/**
 * Build web assets and patch Wrangler static asset routing before deploy.
 */
async function main() {
  await executeCommand("pnpm", ["--dir", webDir, "run", "build"]);
  await executeCommand("pnpm", ["--dir", serverDir, "run", "build"]);
  await writeWranglerAssets();
}

/**
 * Patch Wrangler config so Cloudflare serves the web build as Worker assets.
 */
async function writeWranglerAssets() {
  const wrangler = await readJsonFile<Record<string, unknown>>(wranglerPath);

  wrangler.assets = {
    directory: webDistDir,
    not_found_handling: "single-page-application",
    binding: "ASSETS",
    run_worker_first: dynamicRoutePatterns,
  };

  await writeJsonFile(wranglerPath, wrangler);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
