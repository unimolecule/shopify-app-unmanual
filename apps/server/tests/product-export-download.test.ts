import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockRuntimeCapabilities,
  runtimeConfig,
} from "./shopify/test-utils";
import type { FileDownloadResolver } from "@/app/modules/file/types";
import type { ProductExportRepository } from "@/app/modules/product-export/repositories/database";
import type { downloadProductExport } from "@/app/modules/product-export/service";
import type { ProductExportRecord } from "@/app/modules/product-export/types";

const findByIdMock = vi.hoisted(() => vi.fn());

describe("product export download", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves ready product export files through the file download resolver", async () => {
    const record = createProductExportRecord({
      bucketKey:
        "test-shop.myshopify.com/product-exports/2026/06/export-1/products.csv",
      status: "ready",
    });
    const resolver: FileDownloadResolver = {
      resolve: vi.fn(() =>
        Promise.resolve({
          body: streamFromText("id,title\n"),
          headers: { "Content-Type": "text/csv" },
          type: "stream" as const,
        }),
      ),
    };
    findByIdMock.mockResolvedValue(record);

    const { downloadProductExport } =
      await import("@/app/modules/product-export/service");
    const download = await downloadProductExport(
      createServiceContext({ resolver }),
      "test-shop.myshopify.com",
      "export-1",
    );

    expect(download.type).toBe("stream");
    expect(findByIdMock).toHaveBeenCalledWith({
      id: "export-1",
      shopDomain: "test-shop.myshopify.com",
    });
    expect(resolver.resolve).toHaveBeenCalledWith({
      file: expect.objectContaining({
        bucketKey:
          "test-shop.myshopify.com/product-exports/2026/06/export-1/products.csv",
        bucketProvider: "memory",
        byteSize: 128,
        contentType: "text/csv",
        id: "export-1",
        originalName: "All products.csv",
        safeName: "All products.csv",
        shopDomain: "test-shop.myshopify.com",
        status: "available",
      }),
    });
  });

  it("returns not found when the export is missing", async () => {
    findByIdMock.mockResolvedValue(null);

    const { downloadProductExport } =
      await import("@/app/modules/product-export/service");

    await expect(
      downloadProductExport(
        createServiceContext({ resolver: { resolve: vi.fn() } }),
        "test-shop.myshopify.com",
        "missing-export",
      ),
    ).rejects.toMatchObject({
      message: "Product export file not found",
      status: 404,
    });
  });

  it("returns not found when the export is not ready or has no bucket object", async () => {
    const resolver: FileDownloadResolver = { resolve: vi.fn() };

    const { downloadProductExport } =
      await import("@/app/modules/product-export/service");

    findByIdMock.mockResolvedValueOnce(
      createProductExportRecord({ bucketKey: null, status: "queued" }),
    );
    await expect(
      downloadProductExport(
        createServiceContext({ resolver }),
        "test-shop.myshopify.com",
        "export-1",
      ),
    ).rejects.toMatchObject({
      message: "Product export file not found",
      status: 404,
    });

    findByIdMock.mockResolvedValueOnce(
      createProductExportRecord({ bucketKey: null, status: "ready" }),
    );
    await expect(
      downloadProductExport(
        createServiceContext({ resolver }),
        "test-shop.myshopify.com",
        "export-1",
      ),
    ).rejects.toMatchObject({
      message: "Product export file not found",
      status: 404,
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});

describe("product export controller errors", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/app/modules/product-export/meta");
    vi.doUnmock("@/app/modules/product-export/service");
    vi.doUnmock("@/app/modules/shopify/session");
    vi.doUnmock("@/app/modules/shopify/webhook");
  });

  it("wraps list responses as data result with nested pagination", async () => {
    const listProductExports = vi.fn(() =>
      Promise.resolve({
        pagination: {
          hasNext: false,
          limit: 20,
          mode: "page" as const,
          page: 2,
          total: 1,
        },
        productExports: [
          createProductExportRecord({ bucketKey: null, status: "queued" }),
        ],
      }),
    );
    vi.doMock("@/app/modules/product-export/meta", () => ({
      ...createProductExportMetaMock(),
    }));
    vi.doMock(
      "@/app/modules/product-export/service",
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import("@/app/modules/product-export/service")
        >()),
        listProductExports,
      }),
    );

    const { registerProductExportController } =
      await import("@/app/modules/product-export/controller");
    const app = { openapi: vi.fn() };
    registerProductExportController(app as never);
    const handler = app.openapi.mock.calls[1][1];
    const response = await handler(createListRouteContext());

    await expect(response.json()).resolves.toMatchObject({
      data: {
        pagination: {
          hasNext: false,
          limit: 20,
          mode: "page",
          page: 2,
          total: 1,
        },
        result: [expect.objectContaining({ id: "export-1" })],
      },
    });
  });

  it("ensures and registers offline Shopify webhooks before creating product exports", async () => {
    const calls: string[] = [];
    const createProductExport = vi.fn(() => {
      calls.push("create");
      return Promise.resolve(
        createProductExportRecord({ bucketKey: null, status: "queued" }),
      );
    });
    const ensureShopifyOfflineSession = vi.fn(() => {
      calls.push("ensure");
      return Promise.resolve({ id: "offline_test-shop.myshopify.com" });
    });
    const registerConfiguredShopifyWebhooks = vi.fn(() => {
      calls.push("register");
      return Promise.resolve();
    });
    vi.doMock("@/app/modules/product-export/meta", () => ({
      ...createProductExportMetaMock(),
    }));
    vi.doMock("@/app/modules/shopify/session", () => ({
      ensureShopifyOfflineSession,
    }));
    vi.doMock("@/app/modules/shopify/webhook", () => ({
      registerConfiguredShopifyWebhooks,
    }));
    vi.doMock(
      "@/app/modules/product-export/service",
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import("@/app/modules/product-export/service")
        >()),
        createProductExport,
      }),
    );

    const { registerProductExportController } =
      await import("@/app/modules/product-export/controller");
    const app = { openapi: vi.fn() };
    registerProductExportController(app as never);
    const handler = app.openapi.mock.calls[0][1];

    await handler(createCreateRouteContext());

    expect(ensureShopifyOfflineSession).toHaveBeenCalled();
    expect(registerConfiguredShopifyWebhooks).toHaveBeenCalledWith(
      expect.anything(),
      { id: "offline_test-shop.myshopify.com" },
    );
    expect(calls).toEqual(["ensure", "register", "create"]);
  });

  it("exposes the underlying create failure reason to API clients", async () => {
    const createProductExport = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Name can only contain alphanumeric characters, underscores, hyphens, periods, or forward slashes",
        ),
      );
    vi.doMock("@/app/modules/shopify/session", () => ({
      ensureShopifyOfflineSession: vi.fn(() => ({
        id: "offline_test-shop.myshopify.com",
      })),
    }));
    vi.doMock("@/app/modules/shopify/webhook", () => ({
      registerConfiguredShopifyWebhooks: vi.fn(),
    }));
    vi.doMock("@/app/modules/product-export/meta", () => ({
      ...createProductExportMetaMock(),
    }));
    vi.doMock(
      "@/app/modules/product-export/service",
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import("@/app/modules/product-export/service")
        >()),
        createProductExport,
      }),
    );

    const { registerProductExportController } =
      await import("@/app/modules/product-export/controller");
    const app = { openapi: vi.fn() };
    registerProductExportController(app as never);
    const handler = app.openapi.mock.calls[0][1];

    await expect(handler(createCreateRouteContext())).rejects.toMatchObject({
      expose: true,
      message:
        "Failed to create product export: Name can only contain alphanumeric characters, underscores, hyphens, periods, or forward slashes",
      status: 502,
    });
  });

  it("returns a JSON download target for redirect downloads when requested", async () => {
    const downloadProductExport = vi.fn(() =>
      Promise.resolve({
        headers: { "Cache-Control": "private, no-store" },
        type: "redirect" as const,
        url: "https://signed.example.com/products.csv",
      }),
    );
    vi.doMock("@/app/modules/product-export/meta", () => ({
      ...createProductExportMetaMock(),
    }));
    vi.doMock(
      "@/app/modules/product-export/service",
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import("@/app/modules/product-export/service")
        >()),
        downloadProductExport,
      }),
    );

    const { registerProductExportController } =
      await import("@/app/modules/product-export/controller");
    const app = { openapi: vi.fn() };
    registerProductExportController(app as never);
    const handler = app.openapi.mock.calls[4][1];
    const response = await handler(createDownloadRouteContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        type: "redirect",
        url: "https://signed.example.com/products.csv",
      },
      requestId: "req_test",
      success: true,
    });
  });

  it("returns product export templates from the module reference route", async () => {
    vi.doMock("@/app/modules/product-export/meta", () => ({
      ...createProductExportMetaMock(),
    }));

    const { registerProductExportController } =
      await import("@/app/modules/product-export/controller");
    const app = { openapi: vi.fn() };
    registerProductExportController(app as never);
    const handler = app.openapi.mock.calls[2][1];
    const response = await handler(createListRouteContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          code: "basic",
          fields: [
            "id",
            "productId",
            "title",
            "handle",
            "status",
            "vendor",
            "productType",
            "createdAt",
            "updatedAt",
          ],
          label: "Basic",
        },
      ],
      requestId: "req_test",
      success: true,
    });
  });
});

function createProductExportMetaMock() {
  return {
    createProductExportRoute: { path: "/api/product-exports" },
    deleteProductExportRoute: { path: "/api/product-exports/{id}" },
    downloadProductExportRoute: {
      path: "/api/product-exports/{id}/download",
    },
    getProductExportRoute: { path: "/api/product-exports/{id}" },
    listProductExportTemplatesRoute: {
      path: "/api/product-exports/reference/templates",
    },
    listProductExportsRoute: { path: "/api/product-exports" },
  };
}

function createServiceContext(options: { resolver: FileDownloadResolver }) {
  const productExportsMock: Pick<ProductExportRepository, "findById"> = {
    findById: findByIdMock,
  };
  const productExports = productExportsMock as ProductExportRepository;
  const runtimeCapabilities = createMockRuntimeCapabilities({
    database: {
      repositories: {
        productExports: () => productExports,
      },
    },
    file: {
      downloadResolver: () => options.resolver,
    },
  });
  const context = {
    get(key: string) {
      if (key === "runtimeEnv") return runtimeConfig;
      if (key === "runtimeCapabilities") return runtimeCapabilities;
      if (key === "requestId") return "req_test";
      return;
    },
  } satisfies Pick<Parameters<typeof downloadProductExport>[0], "get">;

  return context as Parameters<typeof downloadProductExport>[0];
}

function createCreateRouteContext() {
  return {
    get(key: string) {
      if (key === "requestId") return "req_test";
      if (key === "runtimeEnv") return runtimeConfig;
      if (key === "shopDomain") return "test-shop.myshopify.com";
      return;
    },
    json(value: unknown, status: number) {
      return Response.json(value, { status });
    },
    req: {
      valid(type: string) {
        if (type === "json") return { name: "All products", template: "basic" };
        return {};
      },
    },
  };
}

function createListRouteContext() {
  return {
    get(key: string) {
      if (key === "requestId") return "req_test";
      if (key === "shopDomain") return "test-shop.myshopify.com";
      return;
    },
    json(value: unknown, status: number) {
      return Response.json(value, { status });
    },
    req: {
      valid(type: string) {
        if (type === "query") return { limit: 20, page: 2 };
        return {};
      },
    },
  };
}

function createDownloadRouteContext() {
  return {
    get(key: string) {
      if (key === "requestId") return "req_test";
      if (key === "shopDomain") return "test-shop.myshopify.com";
      return;
    },
    json(value: unknown, status: number) {
      return Response.json(value, { status });
    },
    req: {
      header(name: string) {
        return name.toLowerCase() === "accept" ? "application/json" : undefined;
      },
      param(name: string) {
        return name === "id" ? "export-1" : "";
      },
      url: "https://app.example.com/api/product-exports/export-1/download",
    },
  };
}

function createProductExportRecord(
  overrides: Pick<ProductExportRecord, "bucketKey" | "status">,
): ProductExportRecord {
  const now = new Date("2026-06-18T12:00:00.000Z");

  return {
    bucketKey: overrides.bucketKey,
    bucketProvider: overrides.bucketKey ? "memory" : null,
    completedAt: overrides.status === "ready" ? now : null,
    createdAt: now,
    deletedAt: null,
    errorCode: null,
    errorMessage: null,
    fileSize: overrides.status === "ready" ? 128 : null,
    id: "export-1",
    name: "All products",
    objectCount: overrides.status === "ready" ? 12 : null,
    partialDataUrl: null,
    resultUrl: null,
    shopDomain: "test-shop.myshopify.com",
    shopifyBulkOperationId: null,
    shopifyBulkOperationStatus: null,
    shopifySessionId: null,
    status: overrides.status,
    template: "basic",
    updatedAt: now,
  };
}

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
