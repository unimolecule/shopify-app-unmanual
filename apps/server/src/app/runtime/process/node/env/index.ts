import { getRuntimeConfig } from "@/infra/env";
import type { ConfigSchema } from "@shamt/app-env";

/**
 * Process-only validated env singleton.
 * Use this only in code that runs outside isolate request-bound environments.
 */
let parsedEnv: ConfigSchema;

try {
  parsedEnv = getRuntimeConfig(process.env);
} catch (error) {
  console.error(`❌ ${(error as Error).message}`);
  process.exit(1);
}

export const env = parsedEnv;
