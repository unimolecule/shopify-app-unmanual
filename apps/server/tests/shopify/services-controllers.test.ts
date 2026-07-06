import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockContext, logger } from "./test-utils";

describe("Shopify services", () => {
  it("fetches products, handles empty data, and wraps GraphQL errors", async () => {
    const { getProducts } = await import("@/app/modules/product/service");
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            products: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/Product/1",
                    title: "Board",
                    status: "ACTIVE",
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ errors: [{ message: "GraphQL failed" }] }),
    };

    await expect(getProducts(client as never)).resolves.toEqual({
      products: {
        edges: [
          {
            node: {
              id: "gid://shopify/Product/1",
              title: "Board",
              status: "ACTIVE",
            },
          },
        ],
      },
    });
    expect(client.request.mock.calls[0][0]).toContain("products(first: 5)");
    await expect(getProducts(client as never)).resolves.toBeNull();
    await expect(getProducts(client as never)).rejects.toMatchObject({
      status: 502,
      message: "Failed to fetch products",
      details: { errors: [{ message: "GraphQL failed" }] },
    });
  });

  it("fetches shop info, handles empty data, and wraps GraphQL errors", async () => {
    const { getShopInfo } = await import("@/app/modules/shop/service");
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            shop: {
              name: "Test Shop",
              email: "merchant@example.com",
              myshopifyDomain: "test.myshopify.com",
            },
          },
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ errors: [{ message: "GraphQL failed" }] }),
    };

    await expect(getShopInfo(client as never)).resolves.toEqual({
      shop: {
        name: "Test Shop",
        email: "merchant@example.com",
        myshopifyDomain: "test.myshopify.com",
      },
    });
    expect(client.request.mock.calls[0][0]).toContain("myshopifyDomain");
    await expect(getShopInfo(client as never)).resolves.toBeNull();
    await expect(getShopInfo(client as never)).rejects.toMatchObject({
      status: 502,
      message: "Failed to fetch shop info",
      details: { errors: [{ message: "GraphQL failed" }] },
    });
  });
});

describe("Shopify controllers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/infra/provider");
    vi.doUnmock("@/app/modules/shopify/admin");
    vi.doUnmock("@/app/modules/product/service");
    vi.doUnmock("@/app/modules/shop/service");
  });

  function createOpenApiContext() {
    return {
      get: vi.fn((key: string) =>
        key === "requestId" ? "req_test" : undefined,
      ),
      json: vi.fn((body, status) => ({ body, status })),
      var: { shopifyAdminClient: { id: "client" } },
    };
  }

  it("registers product controller success and error handlers", async () => {
    const { AppError } = await import("@/shared/models");
    const getProducts = vi
      .fn()
      .mockResolvedValueOnce({ products: { edges: [] } })
      .mockRejectedValueOnce(
        new AppError({ status: 502, message: "App failure" }),
      )
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce("string boom");
    vi.doMock("@/app/modules/product/service", () => ({
      getProducts,
    }));

    const { registerProductController } =
      await import("@/app/modules/product/controller");
    const app = { openapi: vi.fn() };
    registerProductController(app as never);
    const handler = app.openapi.mock.calls[0][1];
    const context = createOpenApiContext();

    expect(await handler(context)).toEqual({
      status: 200,
      body: expect.objectContaining({
        data: { products: { edges: [] } },
        requestId: "req_test",
        success: true,
      }),
    });
    expect(getProducts).toHaveBeenNthCalledWith(1, { id: "client" });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "App failure",
      status: 502,
    });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "Failed to fetch products",
      status: 502,
      details: { message: "boom" },
    });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "Failed to fetch products",
      status: 502,
      details: { message: "string boom" },
    });
  });

  it("registers shop controller success and error handlers", async () => {
    const { AppError } = await import("@/shared/models");
    const getShopInfo = vi
      .fn()
      .mockResolvedValueOnce({
        shop: {
          name: "Test Shop",
          email: "merchant@example.com",
          myshopifyDomain: "test.myshopify.com",
        },
      })
      .mockRejectedValueOnce(
        new AppError({ status: 502, message: "App failure" }),
      )
      .mockRejectedValueOnce("boom")
      .mockRejectedValueOnce(new Error("error boom"));
    vi.doMock("@/app/modules/shop/service", () => ({
      getShopInfo,
    }));

    const { registerShopController } =
      await import("@/app/modules/shop/controller");
    const app = { openapi: vi.fn() };
    registerShopController(app as never);
    const handler = app.openapi.mock.calls[0][1];
    const context = createOpenApiContext();

    expect(await handler(context)).toEqual({
      status: 200,
      body: expect.objectContaining({
        data: {
          shop: {
            name: "Test Shop",
            email: "merchant@example.com",
            myshopifyDomain: "test.myshopify.com",
          },
        },
        requestId: "req_test",
        success: true,
      }),
    });
    expect(getShopInfo).toHaveBeenNthCalledWith(1, { id: "client" });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "App failure",
      status: 502,
    });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "Failed to fetch shop info",
      status: 502,
      details: { message: "boom" },
    });
    await expect(handler(createOpenApiContext())).rejects.toMatchObject({
      message: "Failed to fetch shop info",
      status: 502,
      details: { message: "error boom" },
    });
  });
});

describe("Shopify Admin API client middleware", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock("@/infra/provider");
    vi.doUnmock("@/app/modules/shopify/mode");
    vi.doUnmock("@/app/modules/shopify/session");
  });

  it("refreshes the online session and retries once after Shopify returns 401", async () => {
    const firstClient = {
      request: vi.fn().mockRejectedValueOnce(
        Object.assign(new Error("Unauthorized"), {
          response: { code: 401 },
        }),
      ),
    };
    const refreshedClient = {
      request: vi.fn().mockResolvedValueOnce("ok"),
    };
    const refreshedSession = {
      id: "refreshed-session",
      accessToken: "fresh-token",
    };
    const getShopifyClientProvider = vi
      .fn()
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(refreshedClient);
    const refreshShopifyOnlineSession = vi.fn(() => refreshedSession);
    const setShopifySessionContext = vi.fn();

    vi.doMock("@/infra/provider", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/infra/provider")>()),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyClientProvider,
    }));
    vi.doMock("@/app/modules/shopify/mode", () => ({
      getShopifyModeCapabilities: vi.fn(() => ({
        refreshAdminSession: refreshShopifyOnlineSession,
      })),
    }));
    vi.doMock("@/app/modules/shopify/session", () => ({
      setShopifySessionContext,
    }));

    const { createRetryableShopifyAdminClient } =
      await import("@/app/modules/shopify/admin");
    const context = createMockContext({
      vars: { shopDomain: "shop.myshopify.com" },
    });
    const client = await createRetryableShopifyAdminClient(context as never);

    await expect(client.request("query")).resolves.toBe("ok");

    expect(firstClient.request).toHaveBeenCalledWith("query");
    expect(refreshedClient.request).toHaveBeenCalledWith("query");
    expect(refreshShopifyOnlineSession).toHaveBeenCalledWith(context);
    expect(setShopifySessionContext).toHaveBeenCalledWith(
      context,
      refreshedSession,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Shopify Admin API returned 401 for shop.myshopify.com; refreshing session and retrying once",
    );
  });

  it("does not refresh the online session for non-auth Shopify errors", async () => {
    const error = Object.assign(new Error("Forbidden"), {
      response: { code: 403 },
    });
    const getShopifyClientProvider = vi.fn(() => ({
      request: vi.fn().mockRejectedValue(error),
    }));
    const refreshShopifyOnlineSession = vi.fn();

    vi.doMock("@/infra/provider", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/infra/provider")>()),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyClientProvider,
    }));
    vi.doMock("@/app/modules/shopify/mode", () => ({
      getShopifyModeCapabilities: vi.fn(() => ({
        refreshAdminSession: refreshShopifyOnlineSession,
      })),
    }));

    const { createRetryableShopifyAdminClient } =
      await import("@/app/modules/shopify/admin");
    const client = await createRetryableShopifyAdminClient(
      createMockContext() as never,
    );

    await expect(client.request("query")).rejects.toBe(error);
    expect(refreshShopifyOnlineSession).not.toHaveBeenCalled();
  });

  it("proxies non-request client properties and refreshes for response status 401", async () => {
    const firstClient = {
      apiVersion: "2026-07",
      request: vi.fn().mockRejectedValueOnce(
        Object.assign(new Error("Unauthorized"), {
          response: { status: 401 },
        }),
      ),
    };
    const refreshedClient = {
      apiVersion: "2026-07",
      request: vi.fn().mockResolvedValueOnce("ok"),
    };
    const refreshedSession = {
      id: "refreshed-session",
      accessToken: "fresh-token",
    };
    const getShopifyClientProvider = vi
      .fn()
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(refreshedClient);
    const refreshShopifyOnlineSession = vi.fn(() => refreshedSession);
    const setShopifySessionContext = vi.fn();

    vi.doMock("@/infra/provider", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/infra/provider")>()),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyClientProvider,
    }));
    vi.doMock("@/app/modules/shopify/mode", () => ({
      getShopifyModeCapabilities: vi.fn(() => ({
        refreshAdminSession: refreshShopifyOnlineSession,
      })),
    }));
    vi.doMock("@/app/modules/shopify/session", () => ({
      setShopifySessionContext,
    }));

    const { createRetryableShopifyAdminClient } =
      await import("@/app/modules/shopify/admin");
    const client = await createRetryableShopifyAdminClient(
      createMockContext({
        vars: { shopDomain: "shop.myshopify.com" },
      }) as never,
    );

    expect(client.apiVersion).toBe("2026-07");
    await expect(client.request("query", { variables: {} })).resolves.toBe(
      "ok",
    );
    expect(firstClient.request).toHaveBeenCalledWith("query", {
      variables: {},
    });
    expect(refreshedClient.request).toHaveBeenCalledWith("query", {
      variables: {},
    });
    expect(refreshShopifyOnlineSession).toHaveBeenCalledOnce();
    expect(setShopifySessionContext).toHaveBeenCalledWith(
      expect.any(Object),
      refreshedSession,
    );
  });

  it("injects retryable Shopify Admin clients before continuing middleware", async () => {
    const adminClient = { request: vi.fn() };
    const createRetryableShopifyAdminClient = vi.fn(() => adminClient);
    vi.doMock("@/app/modules/shopify/admin/client", () => ({
      createRetryableShopifyAdminClient,
    }));

    const { shopifyAdminClient } =
      await import("@/app/modules/shopify/admin/middleware");
    const context = createMockContext();
    const next = vi.fn();

    await shopifyAdminClient()(context as never, next);

    expect(createRetryableShopifyAdminClient).toHaveBeenCalledWith(context);
    expect(context.var.shopifyAdminClient).toBe(adminClient);
    expect(next).toHaveBeenCalledOnce();
  });
});
