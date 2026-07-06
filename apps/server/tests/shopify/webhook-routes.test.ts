import { InvalidWebhookError } from "@shopify/shopify-api";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockRuntimeCapabilities,
  logger,
  runtimeConfig,
} from "./test-utils";
import type { ProductExportRecord } from "@/app/modules/product-export/types";
import type { AppEnv } from "@/typings";

describe("Shopify webhook routes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/shared/middlewares");
    vi.doUnmock("@/app/modules/shopify/session-storage");
  });

  async function createApp(
    payload?: unknown,
    capabilities?: Parameters<typeof createMockRuntimeCapabilities>[0],
  ) {
    const webhookPayload = payload ?? { id: 1 };

    vi.doMock("@/shared/middlewares", () => ({
      verifyWebhook: async (c: any, next: any) => {
        c.set("webhook", {
          apiVersion: "2026-07",
          payload: webhookPayload,
          shop: "shop.myshopify.com",
          topic: "TEST_TOPIC",
          webhookId: "webhook-1",
        });
        await next();
      },
    }));

    const sessions = [{ id: "session-1" }, { id: "session-2" }];
    const findSessionsByShop = vi.fn(() => sessions);
    const deleteSessions = vi.fn();
    vi.doMock("@/app/modules/shopify/session-storage", () => ({
      getShopifySessionStorage: vi.fn(() => ({
        findSessionsByShop,
        deleteSessions,
      })),
    }));
    vi.doMock("@/infra/provider", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/infra/provider")>()),
      getLoggerProvider: vi.fn(() => logger),
    }));

    const { createWebhookRoutes } =
      await import("@/app/modules/shopify/webhook");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("runtimeLogger", logger as never);
      c.set("runtimeEnv", runtimeConfig);
      c.set("runtimeCapabilities", createMockRuntimeCapabilities(capabilities));
      c.set("requestId", "req_test");
      await next();
    });
    app.route("/webhooks", createWebhookRoutes());

    return { app, findSessionsByShop, deleteSessions };
  }

  it("handles app uninstall webhooks by deleting shop sessions", async () => {
    const { app, findSessionsByShop, deleteSessions } = await createApp();

    const response = await app.request("/webhooks/app/uninstalled", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { ok: true },
      requestId: "req_test",
      success: true,
    });
    expect(findSessionsByShop).toHaveBeenCalledWith("shop.myshopify.com");
    expect(deleteSessions).toHaveBeenCalledWith(["session-1", "session-2"]);
    expect(logger.info).toHaveBeenCalledWith(
      "App uninstalled: shop.myshopify.com",
    );
  });

  it.each([
    [
      "/webhooks/privacy/customers-data-request",
      'Customer data request from shop.myshopify.com: {"id":1}',
    ],
    [
      "/webhooks/privacy/customers-redact",
      'Customer redact request from shop.myshopify.com: {"id":1}',
    ],
    [
      "/webhooks/privacy/shop-redact",
      'Shop redact request from shop.myshopify.com: {"id":1}',
    ],
  ])("handles privacy webhook route %s", async (path, logMessage) => {
    const { app } = await createApp();

    const response = await app.request(path, {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { ok: true },
      requestId: "req_test",
      success: true,
    });
    expect(logger.info).toHaveBeenCalledWith(logMessage);
  });

  it("handles bulk operation finish webhooks for product exports", async () => {
    const record = createProductExportRecord({
      shopifyBulkOperationId: "gid://shopify/BulkOperation/1",
      status: "bulk_operation_running",
    });
    const enqueue = vi.fn();
    const update = vi.fn();

    const { app } = await createApp(
      {
        admin_graphql_api_id: "gid://shopify/BulkOperation/1",
        completed_at: "2026-06-18T12:00:00.000Z",
        file_size: "1024",
        object_count: "10",
        partial_data_url: null,
        status: "completed",
        url: "https://shopify.example.com/bulk-result.jsonl",
      },
      {
        database: {
          repositories: {
            productExports: vi.fn(() => ({
              create: vi.fn(),
              delete: vi.fn(),
              findByBulkOperationId: vi.fn(() => record),
              findById: vi.fn(),
              list: vi.fn(),
              update,
            })) as never,
          },
        },
        queue: {
          producer: vi.fn(() => ({
            enqueue,
            enqueueBatch: vi.fn(),
          })),
        },
      },
    );

    const response = await app.request("/webhooks/bulk_operations/finish", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { ok: true },
      requestId: "req_test",
      success: true,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        fileSize: 1024,
        objectCount: 10,
        resultUrl: "https://shopify.example.com/bulk-result.jsonl",
        shopifyBulkOperationStatus: "completed",
        status: "bulk_operation_completed",
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "product-export.bulk-finished",
        payload: {
          exportId: "product-export-1",
          shopDomain: "shop.myshopify.com",
        },
        version: 1,
      }),
      expect.objectContaining({
        idempotencyKey: "product-export.bulk-finished:product-export-1:",
      }),
    );
  });

  it("registers webhook routes on an app", async () => {
    const { registerWebhookRoutes } =
      await import("@/app/modules/shopify/webhook");
    const app = { route: vi.fn() };

    registerWebhookRoutes(app as never);

    expect(app.route).toHaveBeenCalledWith("/webhooks", expect.any(Object));
  });

  it("registers configured Shopify webhooks for an offline session", async () => {
    vi.doUnmock("@/app/modules/shopify/webhook");
    const addHandlers = vi.fn();
    const register = vi.fn(() => ({
      APP_UNINSTALLED: [{ success: true }],
      BULK_OPERATIONS_FINISH: [{ success: true }],
    }));
    const getShopifyConfigProvider = vi.fn(() => ({
      webhooks: {
        addHandlers,
        register,
      },
    }));
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyConfigProvider,
    }));

    const { registerConfiguredShopifyWebhooks } =
      await import("@/app/modules/shopify/webhook");
    const { SHOPIFY_WEBHOOK_BASE_PATH, SHOPIFY_WEBHOOK_ROUTE_PATHS } =
      await import("@/app/modules/shopify/webhook/constants");
    const context = {
      get: vi.fn((key) => {
        if (key === "runtimeEnv") return runtimeConfig;
        if (key === "runtimeLogger") return logger;
      }),
    };
    const session = {
      id: "offline_shop.myshopify.com",
      shop: "shop.myshopify.com",
    };

    const result = await registerConfiguredShopifyWebhooks(
      context as never,
      session as never,
    );

    expect(getShopifyConfigProvider).toHaveBeenCalledWith(runtimeConfig);
    expect(addHandlers).toHaveBeenCalledWith({
      APP_UNINSTALLED: expect.objectContaining({
        callbackUrl: `${SHOPIFY_WEBHOOK_BASE_PATH}${SHOPIFY_WEBHOOK_ROUTE_PATHS.APP_UNINSTALLED}`,
        deliveryMethod: "http",
      }),
      BULK_OPERATIONS_FINISH: expect.objectContaining({
        callbackUrl: `${SHOPIFY_WEBHOOK_BASE_PATH}${SHOPIFY_WEBHOOK_ROUTE_PATHS.BULK_OPERATIONS_FINISH}`,
        deliveryMethod: "http",
      }),
    });
    expect(register).toHaveBeenCalledWith({ session });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        "Registered Shopify webhooks for shop.myshopify.com",
      ),
    );
    expect(result).toEqual({
      APP_UNINSTALLED: [{ success: true }],
      BULK_OPERATIONS_FINISH: [{ success: true }],
    });
  });

  it("adds Shopify webhook handlers only once per Shopify SDK instance", async () => {
    vi.doUnmock("@/app/modules/shopify/webhook");
    const addHandlers = vi.fn();
    const register = vi.fn(() => ({}));
    const shopify = {
      webhooks: {
        addHandlers,
        register,
      },
    };
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyConfigProvider: vi.fn(() => shopify),
    }));

    const { registerConfiguredShopifyWebhooks } =
      await import("@/app/modules/shopify/webhook");
    const context = {
      get: vi.fn((key) => {
        if (key === "runtimeEnv") return runtimeConfig;
        if (key === "runtimeLogger") return logger;
      }),
    };
    const session = {
      id: "offline_shop.myshopify.com",
      shop: "shop.myshopify.com",
    };

    await registerConfiguredShopifyWebhooks(context as never, session as never);
    await registerConfiguredShopifyWebhooks(context as never, session as never);

    expect(addHandlers).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("omits Shopify webhook register result when the SDK returns undefined", async () => {
    vi.doUnmock("@/app/modules/shopify/webhook");
    const addHandlers = vi.fn();
    const register = vi.fn(() => undefined);
    const shopify = {
      webhooks: {
        addHandlers,
        register,
      },
    };
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getLoggerProvider: vi.fn(() => logger),
      getShopifyConfigProvider: vi.fn(() => shopify),
    }));

    const { registerConfiguredShopifyWebhooks } =
      await import("@/app/modules/shopify/webhook");
    const context = {
      get: vi.fn((key) => {
        if (key === "runtimeEnv") return runtimeConfig;
        if (key === "runtimeLogger") return logger;
      }),
    };
    const session = {
      id: "offline_shop.myshopify.com",
      shop: "shop.myshopify.com",
    };

    await registerConfiguredShopifyWebhooks(context as never, session as never);

    expect(logger.info).toHaveBeenCalledWith(
      "Registered Shopify webhooks for shop.myshopify.com",
    );
  });

  it("normalizes Shopify SDK webhook errors through the app error model", async () => {
    vi.doUnmock("@/app/modules/shopify/webhook");
    vi.doMock("@/shared/middlewares", () => ({
      verifyWebhook: () => {
        throw new InvalidWebhookError({
          message: "Could not validate request HMAC",
          response: new Response("Could not validate request HMAC", {
            status: 401,
            statusText: "Unauthorized",
            headers: {
              "content-type": "text/plain",
              "x-shopify-error": "webhook",
            },
          }),
        });
      },
    }));
    vi.doMock("@/infra/provider", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/infra/provider")>()),
      getLoggerProvider: vi.fn(() => logger),
    }));

    const { createWebhookRoutes } =
      await import("@/app/modules/shopify/webhook");
    const { onAppError } = await import("@/app/lifecycle/error");
    const app = new Hono<AppEnv>();
    onAppError(app);
    app.route("/webhooks", createWebhookRoutes());

    const response = await app.request("/webhooks/app/uninstalled", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("x-shopify-error")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      code: 401,
      message: "Invalid Shopify webhook request",
      success: false,
    });
  });
});

function createProductExportRecord(
  overrides: Partial<ProductExportRecord> = {},
): ProductExportRecord {
  const now = new Date("2026-06-18T12:00:00.000Z");

  return {
    bucketKey: null,
    bucketProvider: null,
    completedAt: null,
    createdAt: now,
    deletedAt: null,
    errorCode: null,
    errorMessage: null,
    fileSize: null,
    id: "product-export-1",
    name: "All products",
    objectCount: null,
    partialDataUrl: null,
    resultUrl: null,
    shopDomain: "shop.myshopify.com",
    shopifyBulkOperationId: null,
    shopifyBulkOperationStatus: null,
    shopifySessionId: null,
    status: "queued",
    template: "basic",
    updatedAt: now,
    ...overrides,
  };
}
