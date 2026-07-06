import { getLogger } from "@logtape/logtape";
import { DEFAULT_LOG_LEVEL } from "@shamt/app-env";
import { name } from "../../../package.json";
import { setupConsoleLogger } from "./shared";

let loggerConfigured = false;

/**
 * Configure a minimal console logger for application bootstrap.
 * This runs before route context exists, so it must not depend on runtime bindings.
 */
export async function setupBootstrapLogger(): Promise<void> {
  if (loggerConfigured) return;

  await setupConsoleLogger({ level: DEFAULT_LOG_LEVEL }, { reset: false });
  loggerConfigured = true;
}

const logger = getLogger([name]);

export type Logger = typeof logger;
export { dispose } from "@logtape/logtape";
export default logger;
