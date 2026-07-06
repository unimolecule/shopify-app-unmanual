import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

function readWorkspaceFile(path: string) {
  return readFile(resolve(workspaceRoot, path), "utf8");
}

async function readPackageJson(path: string) {
  return JSON.parse(await readWorkspaceFile(path)) as {
    exports?: Record<string, unknown>;
    publishConfig?: {
      main?: string;
      module?: string;
      types?: string;
      exports?: Record<string, unknown>;
    };
  };
}

function collectExportConditionValues(exports: Record<string, unknown>) {
  return Object.values(exports).flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    return Object.values(entry).filter(
      (value): value is string => typeof value === "string",
    );
  });
}

describe("build output contracts", () => {
  test("node deploy builds the current server bundle target", async () => {
    const deployScript = await readWorkspaceFile(
      "apps/server/scripts/deploy/node.ts",
    );

    expect(deployScript).toContain('"build"');
    expect(deployScript).not.toContain('"node:build"');
  });

  test("node Docker runtime starts the tsdown process bundle entry", async () => {
    const dockerfile = await readWorkspaceFile("apps/server/Dockerfile");

    expect(dockerfile).toContain("./dist/process/node/index.mjs");
    expect(dockerfile).not.toContain("dist/process/esm/app/runtime/process");
  });

  test.each([
    ["@shamt/app-env", "packages/app-env/package.json"],
    ["@shamt/database", "packages/database/package.json"],
    ["@shamt/envs", "packages/envs/package.json"],
  ])("%s publish exports match tsdown output paths", async (_name, path) => {
    const packageJson = await readPackageJson(path);
    const publishConfig = packageJson.publishConfig;

    if (publishConfig?.main) expect(publishConfig.main).toMatch(/\.cjs$/);
    if (publishConfig?.module) expect(publishConfig.module).toMatch(/\.mjs$/);
    if (publishConfig?.types) expect(publishConfig.types).toMatch(/\.d\.mts$/);
    const exportConditionValues = collectExportConditionValues(
      publishConfig?.exports ?? {},
    );

    expect(exportConditionValues.join("\n")).not.toContain("**");
    expect(exportConditionValues).not.toContainEqual(
      expect.stringMatching(/\.js$/),
    );
  });

  test("database package exposes only stable boundary entrypoints", async () => {
    const packageJson = await readPackageJson("packages/database/package.json");
    const exportKeys = Object.keys(packageJson.exports ?? {});
    const publishExportKeys = Object.keys(
      packageJson.publishConfig?.exports ?? {},
    );

    expect(exportKeys).toEqual([
      "./constants",
      "./models",
      "./models/*",
      "./schemas",
      "./schemas/*",
      "./entities",
      "./package.json",
    ]);
    expect(publishExportKeys).toEqual(exportKeys);
    expect(exportKeys).not.toContain(".");
    expect(exportKeys.join("\n")).not.toContain("sql-schemas");
    expect(exportKeys).not.toContain("./models/postgres/*");
    expect(exportKeys).not.toContain("./schemas/postgres/*");
  });
});
