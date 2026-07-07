import { DEFAULT_APP_DATABASE_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabaseEnvConfig } from "@/infra/database";
import { createIsolateDatabase } from "@/infra/database/isolate";
import {
  disposeProcessDatabase,
  getProcessDatabase,
} from "@/infra/database/process";
import { getRuntimeConfig, type RuntimeConfig } from "@/infra/env";
import { runtimeConfig } from "./shopify/test-utils";

const poolEnd = vi.fn(() => Promise.resolve());
const poolQuery = vi.fn(() => Promise.resolve({ rows: [{ ok: 1 }] }));
const poolInstances: Array<{ connectionString?: string }> = [];

vi.mock("pg", () => ({
  Pool: vi.fn(function Pool(input: { connectionString?: string }) {
    poolInstances.push(input);

    return {
      end: poolEnd,
      query: poolQuery,
    };
  }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn((input: unknown) => ({
    input,
    kind: "postgres-db",
  })),
}));

describe("database runtime strategy", () => {
  afterEach(() => {
    poolEnd.mockClear();
    poolInstances.length = 0;
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("supports node with postgres", () => {
    expect(
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toEqual({
      provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      runtime: "node",
    });
  });

  it("parses node with d1 before database strategy validation", () => {
    expect(
      getRuntimeConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "node",
      }),
    ).toMatchObject({
      APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      APP_RUNTIME: "node",
    });
  });

  it("rejects node with d1 at the database strategy boundary", () => {
    expect(() =>
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toThrow("Node runtime only supports the postgres database provider");
  });

  it("parses cloudflare with postgres before database strategy validation", () => {
    expect(
      getRuntimeConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
        APP_RUNTIME: "cloudflare",
      }),
    ).toMatchObject({
      APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      APP_RUNTIME: "cloudflare",
    });
  });

  it("rejects cloudflare with postgres at the database strategy boundary", () => {
    expect(() =>
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toThrow("Cloudflare runtime only supports the d1 database provider");
  });

  it("supports cloudflare with d1", () => {
    expect(
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toEqual({
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: "cloudflare",
    });
  });

  it("defaults database provider by runtime", () => {
    expect(
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: undefined,
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toEqual({
      provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      runtime: "node",
    });

    expect(
      getDatabaseEnvConfig({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: undefined,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toEqual({
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: "cloudflare",
    });
  });

  it("requires d1 binding for cloudflare d1", async () => {
    await expect(
      createIsolateDatabase({
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).rejects.toMatchObject({
      status: 500,
      message: "Cloudflare D1 binding is required",
    });
  });

  it("supports cloudflare d1 with a binding", async () => {
    const database = await createIsolateDatabase(
      {
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig,
      {
        d1: createD1Binding(),
      },
    );

    expect(database).toMatchObject({
      dialect: "sqlite",
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: "cloudflare",
    });
  });

  it("reuses process database promises until the cache key changes", async () => {
    await disposeProcessDatabase();

    const firstConfig: RuntimeConfig = {
      ...runtimeConfig,
      APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      APP_DATABASE_URL: "postgresql://first",
      APP_RUNTIME: "node",
    };
    const secondConfig: RuntimeConfig = {
      ...firstConfig,
      APP_DATABASE_URL: "postgresql://second",
    };

    const first = getProcessDatabase(firstConfig);
    const second = getProcessDatabase(firstConfig);
    expect(first).toBe(second);
    await first;

    const third = getProcessDatabase(secondConfig);
    expect(third).not.toBe(first);
    await third;

    expect(poolInstances.map((input) => input.connectionString)).toEqual([
      "postgresql://first",
      "postgresql://second",
    ]);

    await disposeProcessDatabase();
  });

  it("checks node postgres with select 1", async () => {
    await disposeProcessDatabase();

    const database = await getProcessDatabase({
      ...runtimeConfig,
      APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      APP_DATABASE_URL: "postgresql://health",
      APP_RUNTIME: "node",
    });

    await expect(database.check()).resolves.toMatchObject({
      dialect: "postgres",
      provider: DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
      runtime: "node",
      status: "ok",
    });
    expect(poolQuery).toHaveBeenCalledWith("select 1");

    await disposeProcessDatabase();
  });

  it("checks cloudflare d1 with select 1", async () => {
    const d1 = createD1Binding();
    const database = await createIsolateDatabase(
      {
        ...runtimeConfig,
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig,
      {
        d1,
      },
    );

    await expect(database.check()).resolves.toMatchObject({
      dialect: "sqlite",
      provider: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      runtime: "cloudflare",
      status: "ok",
    });
    expect(d1.prepare).toHaveBeenCalledWith("select 1");
  });
});

function createD1Binding(): D1Database {
  return {
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () =>
      Promise.resolve({
        count: 0,
        duration: 0,
      }),
    prepare: vi.fn(
      () =>
        ({
          all: () =>
            Promise.resolve({
              meta: {},
              results: [],
              success: true,
            }),
          bind() {
            return this;
          },
          first: () => Promise.resolve(null),
          raw: () => Promise.resolve([]),
          run: () =>
            Promise.resolve({
              meta: {},
              success: true,
            }),
        }) as unknown as D1PreparedStatement,
    ),
  } as unknown as D1Database;
}
