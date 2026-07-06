import { resetClientProvider } from "./client";
import { resetEnvProvider } from "./env";
import { resetLoggerProvider } from "./logger";
import { resetShopifyProvider } from "./shopify";

/**
 * Dispose every typed provider slot.
 * Call this during application shutdown or test teardown.
 */
export async function providersDispose(): Promise<void> {
  resetClientProvider();
  resetShopifyProvider();
  await resetLoggerProvider();
  resetEnvProvider();
}

export * from "./client";
export * from "./env";
export * from "./logger";
export * from "./shopify";
