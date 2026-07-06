import { describe, expect, it } from "vitest";

describe("vite config", () => {
  it("drops console calls from production builds", async () => {
    process.env.APP__SERVER_PORT = "3000";
    process.env.APP__WEB_PORT = "3001";
    process.env.APP_CLOUDFLARE_WORKER_NAME = "test-worker";
    process.env.SHOPIFY_APP_KEY = "test_app_key";
    process.env.SHOPIFY_APP_SECRET = "test_app_secret";
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    process.env.SHOPIFY_API_VERSION = "2026-07";
    process.env.SCOPES = "read_products,write_products";

    const { default: config } = await import("../vite.config");

    expect(typeof config).toBe("function");

    const resolved = await config({
      command: "build",
      mode: "production",
      isPreview: false,
      isSsrBuild: false,
    });

    expect(resolved).toMatchObject({
      build: {
        rolldownOptions: {
          output: {
            minify: {
              compress: {
                dropConsole: true,
              },
            },
          },
        },
      },
    });
  });
});
