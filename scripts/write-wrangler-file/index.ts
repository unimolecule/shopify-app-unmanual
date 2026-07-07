import { writeFile } from "node:fs/promises";
import { configSchema } from "@unimolecule/shopify-app-unmanual-app-env";
import { wranglerPath } from "./constants";
import { renderWranglerConfig } from "./wrangler";

/**
 * Validates env and regenerates the active Wrangler config file.
 */
async function main() {
  const config = configSchema.parse(process.env);
  const wrangler = renderWranglerConfig(config);

  await writeFile(wranglerPath, `${JSON.stringify(wrangler, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
