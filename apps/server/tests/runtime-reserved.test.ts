import { DEFAULT_RUNTIMES } from "@unimolecule/shopify-app-unmanual-app-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockContext, runtimeConfig } from "./shopify/test-utils";

describe("reserved runtimes", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("parses Vercel Edge as a reserved isolate runtime", async () => {
    const { getRuntimeConfig } = await import("@/infra/env");
    const config = getRuntimeConfig({
      ...process.env,
      ...runtimeConfig,
      APP_RUNTIME: DEFAULT_RUNTIMES.VERCEL_EDGE,
    });

    expect(config.APP_RUNTIME).toBe(DEFAULT_RUNTIMES.VERCEL_EDGE);
  });

  it("fails fast for Shopify session storage when no database capability is registered", async () => {
    const { getShopifySessionStorage } =
      await import("@/app/modules/shopify/session-storage");
    const context = createMockContext({
      vars: {
        runtimeEnv: {
          ...runtimeConfig,
          APP_RUNTIME: DEFAULT_RUNTIMES.VERCEL_EDGE,
        },
      },
    });

    await expect(getShopifySessionStorage(context as never)).rejects.toThrow(
      "Runtime capability is not available: shopifySessionStorage",
    );
  });
});
