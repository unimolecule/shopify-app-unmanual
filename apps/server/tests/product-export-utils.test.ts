import { describe, expect, it } from "vitest";
import { PRODUCT_EXPORT_JSONL_CHUNK_BYTES } from "@/app/modules/product-export/queue/constants";
import {
  createProductExportCsvPartStream,
  CSV_HEADER,
  getProductExportFilename,
  readProductExportCsvPartResult,
} from "@/app/modules/product-export/utils";
import { createBucketObjectKey } from "@/utils";
import type { ProductExportPartRecord } from "@/app/modules/product-export/types";

describe("product export streaming CSV utilities", () => {
  it("streams complete JSONL lines into CSV rows and counts them", async () => {
    const part = createPartRecord();
    const stream = createProductExportCsvPartStream(
      streamFromText(
        [
          JSON.stringify({
            createdAt: "2026-06-20T00:00:00Z",
            handle: "first",
            id: "gid://shopify/Product/1",
            productType: "Tee",
            status: "ACTIVE",
            title: 'First "Product"',
            updatedAt: "2026-06-20T00:00:00Z",
            vendor: "Shop",
          }),
          "\n",
          JSON.stringify({
            createdAt: "2026-06-20T00:00:00Z",
            handle: "second",
            id: "gid://shopify/Product/2",
            productType: "Hat",
            status: "DRAFT",
            title: "Second Product",
            updatedAt: "2026-06-20T00:00:00Z",
            vendor: "Shop",
          }),
          "\n",
          '{"incomplete":true',
        ].join(""),
      ),
      part,
    );

    const result = await readProductExportCsvPartResult(stream);

    expect(CSV_HEADER).toBe(
      "id,productId,title,handle,status,vendor,productType,createdAt,updatedAt\n",
    );
    expect(result.rowCount).toBe(2);
    await expect(new Response(result.body).text()).resolves.toBe(
      [
        '"gid://shopify/Product/1","1","First ""Product""","first","ACTIVE","Shop","Tee","2026-06-20T00:00:00Z","2026-06-20T00:00:00Z"\n',
        '"gid://shopify/Product/2","2","Second Product","second","DRAFT","Shop","Hat","2026-06-20T00:00:00Z","2026-06-20T00:00:00Z"\n',
      ].join(""),
    );
  });

  it("leaves productId empty for non-product gids", async () => {
    const stream = createProductExportCsvPartStream(
      streamFromText(
        `${JSON.stringify({
          id: "gid://shopify/ProductVariant/1",
          title: "Variant row",
        })}\n`,
      ),
      createPartRecord(),
    );

    const result = await readProductExportCsvPartResult(stream);

    expect(result.rowCount).toBe(1);
    await expect(new Response(result.body).text()).resolves.toBe(
      '"gid://shopify/ProductVariant/1","","Variant row","","","","","",""\n',
    );
  });

  it("uses byte offsets for multibyte JSONL lines when filtering overlap windows", async () => {
    const multibytePadding = "中".repeat(PRODUCT_EXPORT_JSONL_CHUNK_BYTES / 2);
    const lines = [
      JSON.stringify({
        id: "gid://shopify/Product/1",
        title: multibytePadding,
      }),
      JSON.stringify({
        id: "gid://shopify/Product/2",
        title: "Second Product",
      }),
    ];
    const jsonl = `${lines.join("\n")}\n`;
    const firstLineByteLength = new TextEncoder().encode(
      `${lines[0]}\n`,
    ).byteLength;
    const stream = createProductExportCsvPartStream(streamFromText(jsonl), {
      ...createPartRecord(),
      rangeStart: 0,
      seq: 1,
    });

    const result = await readProductExportCsvPartResult(stream);

    expect(firstLineByteLength).toBeGreaterThan(lines[0].length + 1);
    expect(firstLineByteLength).toBeGreaterThan(
      PRODUCT_EXPORT_JSONL_CHUNK_BYTES,
    );
    expect(result.rowCount).toBe(1);
    await expect(new Response(result.body).text()).resolves.toContain(
      '"gid://shopify/Product/2","2","Second Product"',
    );
  });

  it("builds year/month export object keys without a parts folder", () => {
    const input = {
      date: new Date("2026-06-20T00:00:00.000Z"),
      id: "export-1",
      namespace: "product-exports",
      shopDomain: "test-shop.myshopify.com",
    };

    expect(createBucketObjectKey({ ...input, filename: "3.csv" })).toBe(
      "test-shop.myshopify.com/product-exports/2026/06/export-1/3.csv",
    );
    expect(createBucketObjectKey({ ...input, filename: "products.csv" })).toBe(
      "test-shop.myshopify.com/product-exports/2026/06/export-1/products.csv",
    );
  });

  it("builds merchant-facing CSV filenames from export names", () => {
    expect(getProductExportFilename("test2")).toBe("test2.csv");
    expect(getProductExportFilename("test2.csv")).toBe("test2.csv");
    expect(getProductExportFilename(" 导出/report ")).toBe("导出-report.csv");
    expect(getProductExportFilename("...")).toBe("products.csv");
  });
});

function createPartRecord(
  overrides: Partial<ProductExportPartRecord> = {},
): ProductExportPartRecord {
  const now = new Date("2026-06-20T00:00:00.000Z");

  return {
    attempts: 0,
    bucketKey: null,
    bucketProvider: null,
    byteSize: null,
    completedAt: null,
    createdAt: now,
    errorCode: null,
    errorMessage: null,
    exportId: "export-1",
    id: "part-1",
    lockedAt: null,
    rangeEnd: 1024,
    rangeStart: 0,
    rowCount: null,
    seq: 0,
    status: "pending",
    updatedAt: now,
    ...overrides,
  };
}

function streamFromText(value: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(value);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, Math.ceil(bytes.byteLength / 2)));
      controller.enqueue(bytes.subarray(Math.ceil(bytes.byteLength / 2)));
      controller.close();
    },
  });
}
