import { describe, expect, it, vi } from "vitest";
import {
  completeProductExportBulkOperation,
  startProductExportBulkOperationForRecord,
} from "@/app/modules/product-export/service";
import type { ProductExportRepository } from "@/app/modules/product-export/repositories/database";
import type { ProductExportRecord } from "@/app/modules/product-export/types";
import type { ShopifyClient } from "@/infra/provider";

describe("product export Shopify session ownership", () => {
  it("completes bulk operations with an explicit repository dependency", async () => {
    const record = createProductExportRecord({
      shopifyBulkOperationId: "gid://shopify/BulkOperation/1",
      status: "bulk_operation_running",
    });
    const update = vi.fn();
    const repository = createProductExportRepository({
      findByBulkOperationId: vi.fn(() => Promise.resolve(record)),
      update,
    });

    const updated = await completeProductExportBulkOperation({
      input: {
        bulkOperationId: "gid://shopify/BulkOperation/1",
        completedAt: new Date("2026-07-04T02:36:03.000Z"),
        fileSize: 1024,
        objectCount: 10,
        resultUrl: "https://shopify.example.com/products.jsonl",
        shopDomain: "test-shop.myshopify.com",
        status: "COMPLETED",
      },
      repository,
    });

    expect(updated).toMatchObject({
      completedAt: new Date("2026-07-04T02:36:03.000Z"),
      fileSize: 1024,
      objectCount: 10,
      resultUrl: "https://shopify.example.com/products.jsonl",
      shopifyBulkOperationStatus: "COMPLETED",
      status: "bulk_operation_completed",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "bulk_operation_completed",
      }),
    );
  });

  it("persists the offline session id used to start the bulk operation", async () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    const record = createProductExportRecord({ updatedAt: now });
    const update = vi.fn();
    const repository = createProductExportRepository({ update });
    const client = {
      request: vi.fn().mockResolvedValue({
        data: {
          bulkOperationRunQuery: {
            bulkOperation: {
              id: "gid://shopify/BulkOperation/1",
              status: "CREATED",
            },
            userErrors: [],
          },
        },
      }),
    } as unknown as ShopifyClient;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:05:00.000Z"));

    try {
      const updated = await startProductExportBulkOperationForRecord({
        client,
        record,
        shopifySessionId: "offline_test-shop.myshopify.com",
        repository,
      });

      expect(updated).toMatchObject({
        shopifyBulkOperationId: "gid://shopify/BulkOperation/1",
        shopifyBulkOperationStatus: "CREATED",
        shopifySessionId: "offline_test-shop.myshopify.com",
        status: "bulk_operation_running",
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          shopifySessionId: "offline_test-shop.myshopify.com",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

function createProductExportRepository(
  overrides: Partial<ProductExportRepository> = {},
): ProductExportRepository {
  return {
    claimPart: vi.fn(),
    create: vi.fn(),
    createParts: vi.fn(),
    delete: vi.fn(),
    findByBulkOperationId: vi.fn(),
    findById: vi.fn(),
    getPartStats: vi.fn(),
    list: vi.fn(),
    listParts: vi.fn(),
    listPartsPage: vi.fn(),
    listPartsByStatus: vi.fn(),
    listRecoverableExports: vi.fn(),
    markPartDone: vi.fn(),
    markPartFailed: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

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
    id: "export-1",
    name: "All products",
    objectCount: null,
    partialDataUrl: null,
    resultUrl: null,
    shopDomain: "test-shop.myshopify.com",
    shopifyBulkOperationId: null,
    shopifyBulkOperationStatus: null,
    shopifySessionId: null,
    status: "queued",
    template: "basic",
    updatedAt: now,
    ...overrides,
  };
}
