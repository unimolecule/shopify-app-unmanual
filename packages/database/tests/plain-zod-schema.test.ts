import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FileSchema,
  ProductExportPartSchema,
  ProductExportSchema,
  ReferenceSchema,
  ShopifySessionSchema,
} from "../src/entities/plain-zod-schema";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, "..");
const isoTimestamp = "2026-06-21T12:00:00.000Z";

describe("plain zod select entity schemas", () => {
  it("parses serialized PostgreSQL file entities", () => {
    const result = FileSchema.parse({
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
    });

    assert.equal(result.status, "available");
  });

  it("parses serialized PostgreSQL product export entities", () => {
    const result = ProductExportSchema.parse({
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
    });

    assert.equal(result.template, "basic");
  });

  it("parses serialized PostgreSQL product export part entities", () => {
    const result = ProductExportPartSchema.parse({
      attempts: 1,
      bucketKey: null,
      bucketProvider: null,
      byteSize: null,
      completedAt: null,
      createdAt: isoTimestamp,
      errorCode: null,
      errorMessage: null,
      exportId: "export_1",
      id: "part_1",
      lockedAt: null,
      rangeEnd: 99,
      rangeStart: 0,
      rowCount: null,
      seq: 1,
      status: "pending",
      updatedAt: isoTimestamp,
    });

    assert.equal(result.status, "pending");
  });

  it("parses serialized PostgreSQL reference entities from the current table shape", () => {
    const result = ReferenceSchema.parse({
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
    });

    assert.equal(result.shopDomain, "test-shop.myshopify.com");
  });

  it("parses serialized PostgreSQL Shopify session entities", () => {
    const result = ShopifySessionSchema.parse({
      accessToken: "token",
      accountOwner: null,
      collaborator: null,
      email: null,
      emailVerified: null,
      expires: isoTimestamp,
      firstName: null,
      id: "offline_test-shop.myshopify.com",
      isOnline: false,
      lastName: null,
      locale: null,
      refreshToken: null,
      refreshTokenExpires: null,
      scope: null,
      shop: "test-shop.myshopify.com",
      state: "state",
      userId: null,
    });

    assert.equal(result.shop, "test-shop.myshopify.com");
  });

  it("rejects Date instances because response entities must be JSON-safe", () => {
    assert.throws(() =>
      ReferenceSchema.parse({
        code: "unknown",
        createdAt: new Date(isoTimestamp),
        deletedAt: null,
        enabled: true,
        id: "ref_1",
        label: "Unknown",
        namespace: "gender",
        shopDomain: "test-shop.myshopify.com",
        sortOrder: 10,
        system: false,
        updatedAt: isoTimestamp,
      }),
    );
  });

  it("does not import Drizzle runtime modules from the plain schema source", async () => {
    const source = await readFile(
      resolve(packageRoot, "src/entities/plain-zod-schema/index.ts"),
      "utf8",
    );

    assert.equal(source.includes("drizzle-orm"), false);
    assert.equal(source.includes("drizzle-zod"), false);
    assert.equal(source.includes("../models"), false);
    assert.equal(source.includes("../schemas"), false);
  });
});
