import path from "node:path";
import { findMonorepoRoot, throwError } from "../utils";
import type { ConfigSchema } from "@shamt/app-env";

export type WranglerFileConfig = ConfigSchema;

export const root = findMonorepoRoot();

if (!root) {
  throwError("write-wrangler-file", "Cannot find monorepo root");
}

export const wranglerPath = path.resolve(root, "apps/server/wrangler.json");
export const DEVELOPMENT_ENTRY_PATH =
  "src/app/runtime/isolate/cloudflare/index.ts";
export const PRODUCTION_ENTRY_PATH = "dist/isolate/cloudflare/index.js";
