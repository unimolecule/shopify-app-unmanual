import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "./shopify/test-utils";

describe("infra providers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock("@/infra/env");
    vi.doUnmock("@/infra/logger");
    vi.doUnmock("@/infra/logger/isolate");
    vi.doUnmock("@/infra/logger/process");
    vi.doUnmock("@unimolecule/oh-my-fetch/client");
  });

  function stubRuntimeEnv(overrides: Record<string, unknown> = {}) {
    Object.entries({ ...runtimeConfig, ...overrides }).forEach(
      ([key, value]) => {
        vi.stubEnv(key, String(value));
      },
    );
  }

  it("reuses env provider while the effective env signature is unchanged", async () => {
    stubRuntimeEnv();
    vi.resetModules();
    const getRuntimeConfig = vi.fn((rawEnv) => ({
      ...(rawEnv as Record<string, unknown>),
      parsedAt: getRuntimeConfig.mock.calls.length,
    }));
    vi.doMock("@/infra/env", () => ({
      getRuntimeConfig,
    }));

    const { getEnvProvider, resetEnvProvider } =
      await import("@/infra/provider/env");
    const first = getEnvProvider();
    const cached = getEnvProvider();
    vi.stubEnv("SCOPES", "read_products");
    const changed = getEnvProvider();

    expect(cached).toBe(first);
    expect(changed).not.toBe(first);
    expect(getRuntimeConfig).toHaveBeenCalledTimes(2);

    resetEnvProvider();
  });

  it("recreates env provider when composed schema fields change", async () => {
    stubRuntimeEnv({ APP_FILE_UPLOAD_TIMEOUT: "1000" });
    const getRuntimeConfig = vi.fn((rawEnv) => ({
      ...(rawEnv as Record<string, unknown>),
      parsedAt: getRuntimeConfig.mock.calls.length,
    }));
    vi.doMock("@/infra/env", () => ({
      getRuntimeConfig,
    }));

    const { getEnvProvider, resetEnvProvider } =
      await import("@/infra/provider/env");
    const first = getEnvProvider();
    vi.stubEnv("APP_FILE_UPLOAD_TIMEOUT", "2000");
    const changed = getEnvProvider();

    expect(changed).not.toBe(first);
    expect(getRuntimeConfig).toHaveBeenCalledTimes(2);

    resetEnvProvider();
  });

  it("clears the env provider when disposing providers", async () => {
    stubRuntimeEnv();
    const getRuntimeConfig = vi.fn((rawEnv) => ({
      ...(rawEnv as Record<string, unknown>),
      parsedAt: getRuntimeConfig.mock.calls.length,
    }));
    vi.doMock("@/infra/env", () => ({
      getRuntimeConfig,
    }));

    const { getEnvProvider, providersDispose } =
      await import("@/infra/provider");
    const first = getEnvProvider();

    await providersDispose();

    const recreated = getEnvProvider();

    expect(recreated).not.toBe(first);
    expect(getRuntimeConfig).toHaveBeenCalledTimes(2);
  });

  it("creates the HTTP client with APP_REQUEST_TIMEOUT from the env provider", async () => {
    stubRuntimeEnv({ APP_REQUEST_TIMEOUT: "1234" });
    const createHttpClient = vi.fn((options) => ({
      options,
      dispose: vi.fn(),
    }));
    vi.doMock("@unimolecule/oh-my-fetch/client", () => ({
      createHttpClient,
    }));

    const { getClientProvider, getEnvProvider, resetClientProvider } =
      await import("@/infra/provider");
    const env = getEnvProvider();

    const client = getClientProvider(env);

    expect(client).toEqual({
      options: expect.objectContaining({
        timeout: 1234,
      }),
      dispose: expect.any(Function),
    });
    expect(createHttpClient).toHaveBeenCalledTimes(1);
    expect(createHttpClient).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 1234,
      }),
    );

    resetClientProvider();
  });

  it("recreates the HTTP client when APP_REQUEST_TIMEOUT changes", async () => {
    stubRuntimeEnv({ APP_REQUEST_TIMEOUT: "1000" });
    const createHttpClient = vi.fn((options) => ({
      options,
      dispose: vi.fn(),
    }));
    vi.doMock("@unimolecule/oh-my-fetch/client", () => ({
      createHttpClient,
    }));

    const { getClientProvider, getEnvProvider, resetClientProvider } =
      await import("@/infra/provider");
    const firstEnv = getEnvProvider();
    vi.stubEnv("APP_REQUEST_TIMEOUT", "2000");
    const secondEnv = getEnvProvider();

    const firstClient = getClientProvider(firstEnv);
    const secondClient = getClientProvider(secondEnv);

    expect(firstClient).not.toBe(secondClient);
    expect(firstClient.dispose).toHaveBeenCalledTimes(1);
    expect(secondClient.dispose).not.toHaveBeenCalled();
    expect(createHttpClient).toHaveBeenCalledTimes(2);
    expect(createHttpClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        timeout: 1000,
      }),
    );
    expect(createHttpClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        timeout: 2000,
      }),
    );

    resetClientProvider();
  });

  it("does not recreate the HTTP client when unrelated file config changes", async () => {
    stubRuntimeEnv({
      APP_FILE_UPLOAD_TIMEOUT: "1000",
      APP_REQUEST_TIMEOUT: "1234",
    });
    const createHttpClient = vi.fn((options) => ({
      options,
      dispose: vi.fn(),
    }));
    vi.doMock("@unimolecule/oh-my-fetch/client", () => ({
      createHttpClient,
    }));

    const { getClientProvider, getEnvProvider, resetClientProvider } =
      await import("@/infra/provider");
    const firstEnv = getEnvProvider();
    vi.stubEnv("APP_FILE_UPLOAD_TIMEOUT", "2000");
    const secondEnv = getEnvProvider();

    const firstClient = getClientProvider(firstEnv);
    const secondClient = getClientProvider(secondEnv);

    expect(secondClient).toBe(firstClient);
    expect(firstClient.dispose).not.toHaveBeenCalled();
    expect(createHttpClient).toHaveBeenCalledTimes(1);

    resetClientProvider();
  });

  it("uses the bootstrap logger until runtime config is available", async () => {
    const runtimeLogger = { info: vi.fn() };
    const setupBootstrapLogger = vi.fn();
    const setupLogger = vi.fn();
    const setupProcessLogger = vi.fn();
    const setupIsolateLogger = vi.fn();
    vi.doMock("@/infra/logger", () => ({
      default: runtimeLogger,
      dispose: vi.fn(),
      setupBootstrapLogger,
      setupLogger,
    }));
    vi.doMock("@/infra/logger/process", () => ({
      setupProcessLogger,
    }));
    vi.doMock("@/infra/logger/isolate", () => ({
      setupIsolateLogger,
    }));

    const {
      getLoggerProvider,
      registerProcessLoggerSetup,
      resetLoggerProvider,
    } = await import("@/infra/provider/logger");
    registerProcessLoggerSetup(setupProcessLogger);

    await expect(getLoggerProvider()).resolves.toBe(runtimeLogger);
    await expect(getLoggerProvider(runtimeConfig as never)).resolves.toBe(
      runtimeLogger,
    );
    await expect(getLoggerProvider()).resolves.toBe(runtimeLogger);

    expect(setupBootstrapLogger).toHaveBeenCalledTimes(1);
    expect(setupBootstrapLogger.mock.invocationCallOrder[0]).toBeLessThan(
      setupProcessLogger.mock.invocationCallOrder[0],
    );
    expect(setupProcessLogger).toHaveBeenCalledWith(runtimeConfig, {
      reset: true,
    });
    expect(setupLogger).not.toHaveBeenCalled();
    expect(setupIsolateLogger).not.toHaveBeenCalled();

    resetLoggerProvider();
  });

  it("clears the logger provider when disposing providers", async () => {
    const runtimeLogger = { info: vi.fn() };
    const setupBootstrapLogger = vi.fn();
    const dispose = vi.fn();
    vi.doMock("@/infra/logger", () => ({
      default: runtimeLogger,
      dispose,
      setupBootstrapLogger,
      setupLogger: vi.fn(),
    }));

    const { getLoggerProvider, providersDispose } =
      await import("@/infra/provider");

    await expect(getLoggerProvider()).resolves.toBe(runtimeLogger);
    await providersDispose();
    await expect(getLoggerProvider()).resolves.toBe(runtimeLogger);

    expect(setupBootstrapLogger).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("caches runtime logger setup by logger-affecting config fields", async () => {
    const runtimeLogger = { info: vi.fn() };
    const setupProcessLogger = vi.fn();
    vi.doMock("@/infra/logger", () => ({
      default: runtimeLogger,
      dispose: vi.fn(),
      setupBootstrapLogger: vi.fn(),
      setupLogger: vi.fn(),
    }));
    vi.doMock("@/infra/logger/process", () => ({
      setupProcessLogger,
    }));
    vi.doMock("@/infra/logger/isolate", () => ({
      setupIsolateLogger: vi.fn(),
    }));

    const {
      getLoggerProvider,
      registerProcessLoggerSetup,
      resetLoggerProvider,
    } = await import("@/infra/provider/logger");
    registerProcessLoggerSetup(setupProcessLogger);

    const first = await getLoggerProvider(runtimeConfig as never);
    const cached = await getLoggerProvider({
      ...runtimeConfig,
      SCOPES: "read_products",
    } as never);
    const withDifferentDir = await getLoggerProvider({
      ...runtimeConfig,
      APP_LOGGER_DIR: "different-logs",
    } as never);
    const withDifferentEnv = await getLoggerProvider({
      ...runtimeConfig,
      APP_ENV: "production",
    } as never);

    expect(first).toBe(runtimeLogger);
    expect(cached).toBe(runtimeLogger);
    expect(withDifferentDir).toBe(runtimeLogger);
    expect(withDifferentEnv).toBe(runtimeLogger);
    expect(setupProcessLogger).toHaveBeenCalledTimes(3);
    expect(setupProcessLogger).toHaveBeenNthCalledWith(1, runtimeConfig, {
      reset: false,
    });
    expect(setupProcessLogger).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ APP_LOGGER_DIR: "different-logs" }),
      { reset: true },
    );
    expect(setupProcessLogger).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ APP_ENV: "production" }),
      { reset: true },
    );

    resetLoggerProvider();
  });

  it("uses isolate logger setup for isolate runtime configs", async () => {
    const runtimeLogger = { info: vi.fn() };
    const setupProcessLogger = vi.fn();
    const setupIsolateLogger = vi.fn();
    vi.doMock("@/infra/logger", () => ({
      default: runtimeLogger,
      dispose: vi.fn(),
      setupBootstrapLogger: vi.fn(),
      setupLogger: vi.fn(),
    }));
    vi.doMock("@/infra/logger/process", () => ({
      setupProcessLogger,
    }));
    vi.doMock("@/infra/logger/isolate", () => ({
      setupIsolateLogger,
    }));

    const { getLoggerProvider, resetLoggerProvider } =
      await import("@/infra/provider/logger");
    const cloudflareConfig = {
      ...runtimeConfig,
      APP_RUNTIME: "cloudflare",
    };

    await expect(getLoggerProvider(cloudflareConfig as never)).resolves.toBe(
      runtimeLogger,
    );
    await expect(getLoggerProvider(cloudflareConfig as never)).resolves.toBe(
      runtimeLogger,
    );

    expect(setupIsolateLogger).toHaveBeenCalledTimes(1);
    expect(setupIsolateLogger).toHaveBeenCalledWith(cloudflareConfig, {
      reset: false,
    });
    expect(setupProcessLogger).not.toHaveBeenCalled();

    resetLoggerProvider();
  });
});
