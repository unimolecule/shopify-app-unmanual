import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDatabaseHealth,
  checkDiskHealth,
  checkMemoryHealth,
  getHealths,
} from "@/app/modules/health/service";
import { runtimeCapabilityCloudflare } from "@/app/runtime/isolate/cloudflare/runtime-capabilities";
import { runtimeCapabilityNode } from "@/app/runtime/process/node/runtime-capabilities";
import {
  createMockContext,
  createMockRuntimeCapabilities,
  runtimeConfig,
} from "./shopify/test-utils";
import type { ProcessDatabase } from "@/infra/database/process";

const networkHealthGet = vi.hoisted(() =>
  vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
);

const checkProcessDiskUsage = vi.hoisted(() =>
  vi.fn(() => ({
    availableBytes: 80,
    checks: {},
    freeBytes: 75,
    path: "/tmp/health",
    status: "ok" as const,
    totalBytes: 100,
    usedBytes: 25,
    usedPercent: 0.25,
  })),
);

const checkProcessMemoryUsage = vi.hoisted(() =>
  vi.fn(() => ({
    arrayBuffersBytes: 5,
    checks: {},
    externalBytes: 4,
    heapTotalBytes: 30,
    heapUsedBytes: 20,
    rssBytes: 40,
    status: "ok" as const,
  })),
);

vi.mock("@unimolecule/utils/node", () => ({
  checkProcessDiskUsage,
  checkProcessMemoryUsage,
}));

vi.mock("@/infra/provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/infra/provider")>();

  return {
    ...original,
    getClientProvider: () => ({
      get: networkHealthGet,
    }),
  };
});

describe("health runtime capabilities", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads disk and memory health through registered module capabilities", async () => {
    const context = createMockContext();
    const runtimeCapabilities = createMockRuntimeCapabilities({
      health: {
        disk: (c) => ({
          availableBytes: 800,
          checks: {},
          freeBytes: 700,
          path: "/tmp/custom-health",
          runtime: c.get("runtimeEnv").APP_RUNTIME,
          status: "ok",
          totalBytes: 1_000,
          usedBytes: 300,
          usedPercent: 0.3,
        }),
        memory: (c) => ({
          arrayBuffersBytes: 5,
          checks: {},
          externalBytes: 4,
          heapTotalBytes: 30,
          heapUsedBytes: 20,
          rssBytes: 40,
          runtime: c.get("runtimeEnv").APP_RUNTIME,
          status: "ok",
        }),
      },
    });
    context.set("runtimeCapabilities", runtimeCapabilities);

    await expect(checkDiskHealth(context as never)).resolves.toEqual({
      availableBytes: 800,
      checks: {},
      freeBytes: 700,
      path: "/tmp/custom-health",
      runtime: "node",
      status: "ok",
      target: "disk",
      totalBytes: 1_000,
      usedBytes: 300,
      usedPercent: 0.3,
    });
    await expect(checkMemoryHealth(context as never)).resolves.toEqual({
      arrayBuffers: 5,
      checks: {},
      external: 4,
      heapTotal: 30,
      heapUsed: 20,
      rss: 40,
      runtime: "node",
      status: "ok",
      target: "memory",
    });
  });

  it("registers process health capabilities from @unimolecule/utils node helpers", async () => {
    const context = createMockContext();
    const capabilities = runtimeCapabilityNode({
      runtimeEnv: runtimeConfig,
    });

    await expect(
      capabilities.health.disk(context as never),
    ).resolves.toMatchObject({
      path: "/tmp/health",
      runtime: "node",
      status: "ok",
      totalBytes: 100,
    });
    expect(capabilities.health.memory(context as never)).toMatchObject({
      heapUsedBytes: 20,
      rssBytes: 40,
      runtime: "node",
      status: "ok",
    });
    expect(checkProcessDiskUsage).toHaveBeenCalledTimes(1);
    expect(checkProcessMemoryUsage).toHaveBeenCalledTimes(1);
  });

  it("registers unsupported isolate health capabilities", () => {
    const runtimeEnv: typeof runtimeConfig = {
      ...runtimeConfig,
      APP_RUNTIME: "cloudflare",
    };
    const capabilities = runtimeCapabilityCloudflare({
      env: {},
      runtimeEnv,
    });

    expect(capabilities.health.disk(createMockContext() as never)).toEqual({
      runtime: "cloudflare",
      status: "unsupported",
    });
    expect(capabilities.health.memory(createMockContext() as never)).toEqual({
      runtime: "cloudflare",
      status: "unsupported",
    });
  });

  it("reads database health through the runtime database factory", async () => {
    const context = createMockContext();
    context.set(
      "runtimeCapabilities",
      createMockRuntimeCapabilities({
        database: {
          create: () => createHealthTestDatabase(runtimeConfig.APP_RUNTIME),
        },
      }),
    );

    await expect(checkDatabaseHealth(context as never)).resolves.toEqual({
      dialect: "postgres",
      latencyMs: 1.5,
      provider: "postgres",
      runtime: "node",
      status: "ok",
      target: "database",
    });
  });

  it("aggregates module health checks", async () => {
    const context = createMockContext();
    context.set(
      "runtimeCapabilities",
      createMockRuntimeCapabilities({
        database: {
          create: () => createHealthTestDatabase(runtimeConfig.APP_RUNTIME),
        },
        health: {
          disk: (c) => ({
            availableBytes: 800,
            checks: {},
            freeBytes: 700,
            path: "/tmp/custom-health",
            runtime: c.get("runtimeEnv").APP_RUNTIME,
            status: "ok",
            totalBytes: 1_000,
            usedBytes: 300,
            usedPercent: 0.3,
          }),
          memory: (c) => ({
            arrayBuffersBytes: 5,
            checks: {},
            externalBytes: 4,
            heapTotalBytes: 30,
            heapUsedBytes: 20,
            rssBytes: 40,
            runtime: c.get("runtimeEnv").APP_RUNTIME,
            status: "ok",
          }),
        },
      }),
    );

    await expect(getHealths(context as never)).resolves.toMatchObject({
      checks: {
        database: {
          dialect: "postgres",
          provider: "postgres",
          status: "ok",
          target: "database",
        },
        disk: {
          path: "/tmp/custom-health",
          status: "ok",
          target: "disk",
        },
        memory: {
          heapUsed: 20,
          status: "ok",
          target: "memory",
        },
        network: {
          reachable: true,
          status: "ok",
          statusCode: 204,
          target: "network",
        },
        redis: {
          status: "reserved",
          target: "redis",
        },
      },
      status: "ok",
    });
    expect(networkHealthGet).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        responseType: "response",
      }),
    );
  });
});

function createHealthTestDatabase(
  runtime: ProcessDatabase["runtime"],
): ProcessDatabase {
  const check: ProcessDatabase["check"] = () =>
    Promise.resolve({
      dialect: "postgres",
      latencyMs: 1.5,
      provider: "postgres",
      runtime,
      status: "ok",
    });

  return {
    check,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Drizzle client is not used by these health service tests.
    db: {} as ProcessDatabase["db"],
    dialect: "postgres",
    dispose: vi.fn(),
    provider: "postgres",
    runtime,
  };
}
