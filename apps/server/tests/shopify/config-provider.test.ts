import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger, runtimeConfig } from "./test-utils";

const { shopifyApi } = vi.hoisted(() => ({
  shopifyApi: vi.fn((options) => ({ options })),
}));

vi.mock("@shopify/shopify-api", () => ({
  ApiVersion: {
    July26: "July26",
  },
  LogSeverity: {
    Debug: 0,
    Info: 1,
    Warning: 2,
    Error: 3,
  },
  shopifyApi,
}));

vi.mock("@shopify/shopify-api/adapters/web-api", () => ({}));

describe("Shopify config", () => {
  beforeEach(() => {
    shopifyApi.mockClear();
    vi.clearAllMocks();
  });

  it("creates Shopify API config from runtime config", async () => {
    const { createShopifyConfig } =
      await import("@/app/modules/shopify/config");

    const shopify = createShopifyConfig(
      runtimeConfig as never,
      logger as never,
    );

    expect(shopifyApi).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test_app_key",
        apiSecretKey: "test_app_secret",
        apiVersion: "July26",
        hostName: "app.example.com",
        hostScheme: "https",
        isEmbeddedApp: true,
        scopes: ["read_products", "write_products"],
      }),
    );
    expect(shopify).toEqual({ options: expect.any(Object) });
  });

  it("supports http app URLs and maps Shopify logger severities", async () => {
    const { LogSeverity } = await import("@shopify/shopify-api");
    const { createShopifyConfig } =
      await import("@/app/modules/shopify/config");

    createShopifyConfig(
      {
        ...runtimeConfig,
        SHOPIFY_APP_URL: "http://localhost:3000",
        SCOPES: " read_products, ,write_products ",
      } as never,
      logger as never,
    );

    const options = shopifyApi.mock.calls.at(-1)?.[0];
    expect(options).toMatchObject({
      hostName: "localhost:3000",
      hostScheme: "http",
      scopes: ["read_products", "write_products"],
    });

    options.logger.log(LogSeverity.Debug, "debug");
    options.logger.log(LogSeverity.Info, "info");
    options.logger.log(LogSeverity.Warning, "warn");
    options.logger.log(LogSeverity.Error, "error");

    expect(logger.debug).toHaveBeenCalledWith("debug");
    expect(logger.info).toHaveBeenCalledWith("info");
    expect(logger.warn).toHaveBeenCalledWith("warn");
    expect(logger.error).toHaveBeenCalledWith("error");
  });

  it("creates non-embedded Shopify API config for standalone mode", async () => {
    const { createShopifyConfig } =
      await import("@/app/modules/shopify/config");

    createShopifyConfig(
      {
        ...runtimeConfig,
        SHOPIFY_APP_MODE: "standalone",
      } as never,
      logger as never,
    );

    expect(shopifyApi.mock.calls.at(-1)?.[0]).toMatchObject({
      isEmbeddedApp: false,
    });
  });

  it("rejects unsupported Shopify API versions", async () => {
    const { createShopifyConfig } =
      await import("@/app/modules/shopify/config");

    expect(() =>
      createShopifyConfig(
        { ...runtimeConfig, SHOPIFY_API_VERSION: "2025-10" } as never,
        logger as never,
      ),
    ).toThrow("Unsupported Shopify API version: 2025-10");
  });
});

describe("Shopify provider and HTTP client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.doUnmock("@/app/modules/shopify/config");
    vi.doUnmock("@/infra/provider/logger");
    vi.doUnmock("@/infra/provider");
    vi.doUnmock("@/infra/http/shopify");
  });

  it("caches Shopify config by config signature and resets it", async () => {
    vi.resetModules();
    const createShopifyConfig = vi
      .fn()
      .mockReturnValueOnce({ id: "first" })
      .mockReturnValueOnce({ id: "second" })
      .mockReturnValueOnce({ id: "third" })
      .mockReturnValueOnce({ id: "fourth" });
    vi.doMock("@/app/modules/shopify/config", async (importOriginal) => ({
      ...(await importOriginal<
        typeof import("@/app/modules/shopify/config")
      >()),
      createShopifyConfig,
    }));
    vi.doMock("@/infra/provider/logger", () => ({
      getLoggerProvider: vi.fn(() => logger),
    }));

    const { getShopifyConfigProvider, resetShopifyProvider } =
      await import("@/infra/provider/shopify");

    const first = await getShopifyConfigProvider(runtimeConfig as never);
    const cached = await getShopifyConfigProvider(runtimeConfig as never);
    const second = await getShopifyConfigProvider({
      ...runtimeConfig,
      SCOPES: "read_products",
    } as never);
    const third = await getShopifyConfigProvider({
      ...runtimeConfig,
      SHOPIFY_APP_URL: "https://updated.example.com",
    } as never);

    expect(first).toEqual({ id: "first" });
    expect(cached).toBe(first);
    expect(second).toEqual({ id: "second" });
    expect(third).toEqual({ id: "third" });
    expect(createShopifyConfig).toHaveBeenCalledTimes(3);

    resetShopifyProvider();

    const recreated = await getShopifyConfigProvider({
      ...runtimeConfig,
      SHOPIFY_APP_URL: "https://updated.example.com",
    } as never);
    expect(recreated).toEqual({ id: "fourth" });
    expect(createShopifyConfig).toHaveBeenCalledTimes(4);
  });

  it("creates GraphQL clients from Hono context sessions", async () => {
    vi.resetModules();
    const graphqlConstructor = vi.fn(function Graphql(this: unknown, args) {
      return { args };
    });
    const getShopifyConfigProvider = vi.fn(() => ({
      clients: { Graphql: graphqlConstructor },
    }));
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getShopifyConfigProvider,
    }));

    const { createShopifyClient } = await import("@/infra/http/shopify");
    const session = { id: "session-id" };
    const context = {
      get: vi.fn(() => runtimeConfig),
      var: { shopifySession: session },
    };

    const client = await createShopifyClient(context as never);

    expect(getShopifyConfigProvider).toHaveBeenCalledWith(runtimeConfig);
    expect(graphqlConstructor).toHaveBeenCalledWith({ session });
    expect(client).toEqual({ args: { session } });
  });

  it("delegates Shopify client provider creation to the HTTP factory", async () => {
    vi.resetModules();
    const shopifyClient = { request: vi.fn() };
    const createShopifyClient = vi.fn(() => shopifyClient);
    vi.doMock("@/infra/http/shopify", () => ({
      createShopifyClient,
    }));

    const { getShopifyClientProvider } =
      await import("@/infra/provider/shopify");
    const context = { id: "context" };

    expect(getShopifyClientProvider(context as never)).toBe(shopifyClient);
    expect(createShopifyClient).toHaveBeenCalledWith(context);
  });

  it("uses the configured app name in the account session cookie constant", async () => {
    vi.resetModules();
    vi.stubEnv("APP_NAME", "custom-app");

    const { DEFAULT_APP_ACCOUNT_SESSION_COOKIE } =
      await import("@/constants/shopify");

    expect(DEFAULT_APP_ACCOUNT_SESSION_COOKIE).toBe(
      "custom-app:shopify_session_id",
    );
  });
});
