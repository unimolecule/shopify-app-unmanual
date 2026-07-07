import { DEFAULT_APP_DATABASE_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { describe, expect, it, vi } from "vitest";
import { runtimeCapabilityCloudflare } from "@/app/runtime/isolate/cloudflare/runtime-capabilities";
import { getRuntimeConfig } from "@/infra/env";
import { throwAppServerError as throwError } from "../internal";
import { runtimeConfig } from "./shopify/test-utils";
import type { FileRecord } from "@/app/modules/file/types";

const cloudflareTokenVerifyRequest = vi.fn(() =>
  Promise.resolve(
    Response.json({
      result: {
        id: "access_key",
      },
    }),
  ),
);

vi.mock("@/infra/provider", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/infra/provider")>();

  return {
    ...original,
    getClientProvider: () => ({
      dispose: vi.fn(),
      request: cloudflareTokenVerifyRequest,
    }),
  };
});

vi.mock("@/utils/cloudflare", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/cloudflare")>();

  return {
    ...original,
    getCloudflareTokenId: vi.fn(() => Promise.resolve("access_key")),
  };
});

describe("file download runtime capability", () => {
  it("redirects R2 downloads through a Cloudflare-compatible signed URL", async () => {
    const runtimeEnv = getRuntimeConfig({
      ...runtimeConfig,
      APP_BUCKET_PROVIDER: "r2",
      APP_BUCKET_R2_URL:
        "https://account-id.r2.cloudflarestorage.com/product-export",
      APP_CLOUDFLARE_USER_TOKEN: "token_value",
      APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
      APP_RUNTIME: "cloudflare",
    });
    const r2 = createR2Binding();
    const context = {
      env: {
        test_r2: r2,
      },
    };
    const file: FileRecord = {
      bucketKey: "shop/file.csv",
      bucketProvider: "r2",
      byteSize: 7,
      contentType: "text/csv",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      id: "file_r2",
      originalName: "file.csv",
      safeName: "file.csv",
      shopDomain: "shop.myshopify.com",
      status: "available",
      updatedAt: new Date(),
      deletedAt: null,
    };

    const capabilities = runtimeCapabilityCloudflare({
      env: context.env,
      runtimeEnv,
    });
    const resolver = await capabilities.file.downloadResolver();
    const download = await resolver?.resolve({ file });

    expect(download?.type).toBe("redirect");
    expect(download?.headers).toEqual({
      "Cache-Control": "private, no-store",
    });
    expect(r2.get).not.toHaveBeenCalled();

    if (download?.type !== "redirect") {
      throwError("Expected a redirect download");
    }

    const url = new URL(download.url);
    expect(url.origin).toBe("https://account-id.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/product-export/shop/file.csv");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(
      /^access_key\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    expect(url.searchParams.get("response-content-disposition")).toBe(
      "attachment; filename*=UTF-8''file.csv",
    );
    expect(url.searchParams.get("response-content-type")).toBe("text/csv");
  });
});

function createR2Binding(): R2Bucket {
  const bucket: R2Bucket = {
    createMultipartUpload: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    head: vi.fn(),
    list: vi.fn(),
    put: vi.fn(),
    resumeMultipartUpload: vi.fn(),
  };

  return bucket;
}
