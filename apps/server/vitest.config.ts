import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      // @ts-ignore
      all: true,
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/app/modules/shopify/**/*.ts",
        "src/shared/middlewares/shopify/**/*.ts",
        "src/infra/provider/shopify.ts",
        "src/infra/http/shopify.ts",
        "src/utils/shopify.ts",
        "src/constants/shopify.ts",
        "src/app/modules/product/**/*.ts",
        "src/app/modules/shop/**/*.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
