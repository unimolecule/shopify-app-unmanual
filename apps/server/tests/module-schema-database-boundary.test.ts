import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSchema } from "../src/app/modules/file/schema";
import { ProductExportSchema } from "../src/app/modules/product-export/schema";
import { ReferenceSchema } from "../src/app/modules/reference/schema";

const rootDir = resolve(import.meta.dirname, "..");
const isoTimestamp = "2026-06-21T12:00:00.000Z";

describe("module database entity schemas", () => {
  it("parse serialized database response entities", () => {
    expect(
      FileSchema.parse({
        bucketKey: "shops/test/files/report.csv",
        bucketProvider: "memory",
        byteSize: 128,
        contentType: "text/csv",
        createdAt: isoTimestamp,
        deletedAt: null,
        expiresAt: isoTimestamp,
        id: "file_1",
        originalName: "report.csv",
        safeName: "report.csv",
        shopDomain: "test-shop.myshopify.com",
        status: "available",
        updatedAt: isoTimestamp,
      }).status,
    ).toBe("available");

    expect(
      ProductExportSchema.parse({
        bucketKey: null,
        bucketProvider: null,
        completedAt: null,
        createdAt: isoTimestamp,
        deletedAt: null,
        errorCode: null,
        errorMessage: null,
        fileSize: null,
        id: "export_1",
        name: "Products",
        objectCount: null,
        partialDataUrl: null,
        resultUrl: null,
        shopDomain: "test-shop.myshopify.com",
        shopifyBulkOperationId: null,
        shopifyBulkOperationStatus: null,
        shopifySessionId: null,
        status: "queued",
        template: "basic",
        updatedAt: isoTimestamp,
      }).template,
    ).toBe("basic");

    expect(
      ReferenceSchema.parse({
        code: "unknown",
        createdAt: isoTimestamp,
        deletedAt: null,
        enabled: true,
        id: "ref_1",
        label: "Unknown",
        namespace: "gender",
        shopDomain: "test-shop.myshopify.com",
        sortOrder: 10,
        system: false,
        updatedAt: isoTimestamp,
      }).shopDomain,
    ).toBe("test-shop.myshopify.com");
  });

  it("do not import Drizzle-Zod PostgreSQL schemas into module response schemas", async () => {
    const schemaPaths = [
      "src/app/modules/file/schema.ts",
      "src/app/modules/product-export/schema.ts",
      "src/app/modules/reference/schema.ts",
    ];

    await Promise.all(
      schemaPaths.map(async (schemaPath) => {
        const source = await readFile(resolve(rootDir, schemaPath), "utf8");

        expect(source).not.toContain("@shamt/database/schemas/postgres");
        expect(source).toContain("@shamt/database/entities/plain-zod-schema");
      }),
    );
  });
});
