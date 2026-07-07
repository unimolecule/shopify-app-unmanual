import { DEFAULT_APP_DATABASE_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBucketDownloadSigner } from "@/infra/bucket";
import { createIsolateBucket } from "@/infra/bucket/isolate";
import { getProcessBucket } from "@/infra/bucket/process";
import { getRuntimeConfig, type RuntimeConfig } from "@/infra/env";
import { throwAppServerError as throwError } from "../internal";
import { runtimeConfig } from "./shopify/test-utils";

const objects = new Map<string, Uint8Array>();
const sentCommands: Array<{ input: Record<string, unknown>; type: string }> =
  [];
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

vi.mock("@aws-sdk/client-s3", () => {
  class CreateMultipartUploadCommand {
    readonly type = "create-multipart";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class PutObjectCommand {
    readonly type = "put";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class UploadPartCommand {
    readonly type = "upload-part";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class CompleteMultipartUploadCommand {
    readonly type = "complete-multipart";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class AbortMultipartUploadCommand {
    readonly type = "abort-multipart";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class GetObjectCommand {
    readonly type = "get";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class DeleteObjectCommand {
    readonly type = "delete";

    constructor(readonly input: Record<string, unknown>) {}
  }

  class S3Client {
    async send(
      command:
        | AbortMultipartUploadCommand
        | CompleteMultipartUploadCommand
        | CreateMultipartUploadCommand
        | DeleteObjectCommand
        | GetObjectCommand
        | PutObjectCommand
        | UploadPartCommand,
    ) {
      sentCommands.push({
        input: command.input,
        type: command.type,
      });

      if (command.type === "put") {
        objects.set(
          command.input.Key as string,
          await readBody(command.input.Body as ReadableStream<Uint8Array>),
        );
        return {};
      }

      if (command.type === "create-multipart") {
        return { UploadId: "upload-1" };
      }

      if (command.type === "upload-part") {
        return { ETag: `etag-${command.input.PartNumber as number}` };
      }

      if (command.type === "complete-multipart") {
        return {};
      }

      if (command.type === "abort-multipart") {
        return {};
      }

      if (command.type === "get") {
        const bytes = objects.get(command.input.Key as string);
        return bytes
          ? {
              Body: streamFromBytes(bytes),
              ContentLength: bytes.byteLength,
            }
          : {};
      }

      objects.delete(command.input.Key as string);
      return {};
    }
  }

  return {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
    UploadPartCommand,
  };
});

describe("isolate R2 binding bucket", () => {
  beforeEach(() => {
    objects.clear();
    sentCommands.length = 0;
    vi.unstubAllGlobals();
  });

  it("uses the Cloudflare R2 binding for uploads, reads, and deletes", async () => {
    const r2 = createR2Binding();
    const bucket = createIsolateBucket(createCloudflareR2Config(), { r2 });

    const stored = await bucket.put({
      body: streamFromText("hello"),
      contentType: "text/plain",
      expiresAt: new Date(Date.now() + 1000),
      key: "test-shop/2026/06/file/hello.txt",
      maxBytes: 10,
      originalName: "hello.txt",
      safeName: "hello.txt",
      shopDomain: "test-shop.myshopify.com",
    });

    expect(stored).toEqual({
      byteSize: 5,
      key: "test-shop/2026/06/file/hello.txt",
      provider: "r2",
    });
    expect(r2.createMultipartUpload).toHaveBeenCalledWith(
      "test-shop/2026/06/file/hello.txt",
      expect.objectContaining({
        customMetadata: expect.objectContaining({
          originalName: "hello.txt",
          safeName: "hello.txt",
          shopDomain: "test-shop.myshopify.com",
        }),
        httpMetadata: {
          contentType: "text/plain",
        },
      }),
    );
    expect(r2.put).not.toHaveBeenCalled();

    const opened = await bucket.open({ key: stored.key });
    expect(opened.byteSize).toBe(5);
    await expect(new Response(opened.body).text()).resolves.toBe("hello");

    await bucket.delete({ key: stored.key });
    expect(r2.get).toHaveBeenCalledWith("test-shop/2026/06/file/hello.txt");
    expect(r2.delete).toHaveBeenCalledWith("test-shop/2026/06/file/hello.txt");
    await expect(bucket.open({ key: stored.key })).rejects.toMatchObject({
      message: "Failed to open R2 bucket object",
    });
  });

  it("requires the Cloudflare R2 binding for isolate R2 buckets", () => {
    expect(() => createIsolateBucket(createCloudflareR2Config())).toThrow(
      "Cloudflare R2 bucket binding is required",
    );
  });

  it("rejects binding uploads over maxBytes before the object is stored", async () => {
    const r2 = createR2Binding();
    const bucket = createIsolateBucket(createCloudflareR2Config(), { r2 });

    await expect(
      bucket.put({
        body: streamFromText("hello"),
        contentType: "text/plain",
        expiresAt: new Date(Date.now() + 1000),
        key: "test-shop/hello.txt",
        maxBytes: 4,
        originalName: "hello.txt",
        safeName: "hello.txt",
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toMatchObject({
      status: 413,
    });

    await expect(
      bucket.open({ key: "test-shop/hello.txt" }),
    ).rejects.toMatchObject({
      message: "Failed to open R2 bucket object",
    });
    const upload = await getFirstR2MultipartUpload(r2);
    expect(upload.abort).toHaveBeenCalledOnce();
  });

  it("uploads isolate R2 objects through native multipart with the default 10 MiB part size", async () => {
    const r2 = createR2Binding();
    const bucket = createIsolateBucket(createCloudflareR2Config(), { r2 });
    const bytes = new Uint8Array(12 * 1024 * 1024);
    bytes.fill(65);

    const stored = await bucket.put({
      body: streamFromBytes(bytes),
      contentType: "text/plain",
      expiresAt: new Date(Date.now() + 1000),
      key: "test-shop/native-multipart.txt",
      maxBytes: bytes.byteLength,
      originalName: "native-multipart.txt",
      safeName: "native-multipart.txt",
      shopDomain: "test-shop.myshopify.com",
    });

    expect(stored).toEqual({
      byteSize: bytes.byteLength,
      key: "test-shop/native-multipart.txt",
      provider: "r2",
    });

    const upload = await getFirstR2MultipartUpload(r2);
    expect(upload.uploadPart).toHaveBeenCalledTimes(2);
    expect(upload.uploadPart).toHaveBeenNthCalledWith(
      1,
      1,
      expect.any(Uint8Array),
    );
    expect(upload.uploadPart).toHaveBeenNthCalledWith(
      2,
      2,
      expect.any(Uint8Array),
    );
    expect(
      upload.uploadPart.mock.calls.map(([, value]) => {
        if (!(value instanceof Uint8Array)) {
          throw new TypeError("Expected upload part body to be Uint8Array");
        }

        return value.byteLength;
      }),
    ).toEqual([10 * 1024 * 1024, 2 * 1024 * 1024]);
    expect(upload.complete).toHaveBeenCalledWith([
      { etag: "etag-1", partNumber: 1 },
      { etag: "etag-2", partNumber: 2 },
    ]);
  });

  it("aborts binding multipart uploads when maxParts is exceeded", async () => {
    const r2 = createR2Binding();
    const bucket = createIsolateBucket(createCloudflareR2Config(), {
      partSizeBytes: 5 * 1024 * 1024,
      r2,
    });
    const bytes = new Uint8Array(11 * 1024 * 1024);

    await expect(
      bucket.put({
        body: streamFromBytes(bytes),
        contentType: "text/plain",
        expiresAt: new Date(Date.now() + 1000),
        key: "test-shop/max-parts.txt",
        maxBytes: bytes.byteLength,
        maxParts: 2,
        originalName: "max-parts.txt",
        safeName: "max-parts.txt",
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toMatchObject({
      status: 413,
    });

    const upload = await getFirstR2MultipartUpload(r2);
    expect(upload.uploadPart).toHaveBeenCalledTimes(2);
    expect(upload.abort).toHaveBeenCalledOnce();
    expect(upload.complete).not.toHaveBeenCalled();
  });
});

describe("process R2 S3-compatible download signer", () => {
  beforeEach(() => {
    objects.clear();
    sentCommands.length = 0;
  });

  it("creates short-lived R2 signed download URLs for both runtimes", async () => {
    for (const config of [createNodeR2Config(), createCloudflareR2Config()]) {
      const signer = await createBucketDownloadSigner(config);
      const url = new URL(
        await signer!.signDownloadUrl({
          contentType: "text/csv",
          expiresInMilliseconds: 300_000,
          key: "test-shop/report final.csv",
          originalName: "导出 report.csv",
        }),
      );

      expect(url.origin).toBe("https://account-id.r2.cloudflarestorage.com");
      expect(url.pathname).toBe("/product-export/test-shop/report%20final.csv");
      expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
      expect(url.searchParams.get("X-Amz-Content-Sha256")).toBe(
        "UNSIGNED-PAYLOAD",
      );
      expect(url.searchParams.get("X-Amz-Credential")).toMatch(
        /^access_key\/\d{8}\/auto\/s3\/aws4_request$/,
      );
      expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[\da-f]{64}$/);
      expect(url.searchParams.get("response-content-disposition")).toBe(
        "attachment; filename*=UTF-8''%E5%AF%BC%E5%87%BA%20report.csv",
      );
      expect(url.searchParams.get("response-content-type")).toBe("text/csv");
    }
  });
});

describe("process R2 S3-compatible bucket", () => {
  beforeEach(() => {
    objects.clear();
    sentCommands.length = 0;
  });

  it("uploads through multipart with the default 10 MiB part size", async () => {
    const bucket = await getProcessBucket(createNodeR2Config());
    const bytes = new Uint8Array(12 * 1024 * 1024);
    bytes.fill(65);

    const stored = await bucket.put({
      body: streamFromBytes(bytes),
      contentType: "text/plain",
      expiresAt: new Date(Date.now() + 1000),
      key: "test-shop/hello.txt",
      maxBytes: bytes.byteLength,
      originalName: "hello.txt",
      safeName: "hello.txt",
      shopDomain: "test-shop.myshopify.com",
    });

    expect(stored).toEqual({
      byteSize: bytes.byteLength,
      key: "test-shop/hello.txt",
      provider: "r2",
    });
    expect(sentCommands.map((command) => command.type)).toEqual([
      "create-multipart",
      "upload-part",
      "upload-part",
      "complete-multipart",
    ]);
    expect(sentCommands[0]?.input).toMatchObject({
      Bucket: "product-export",
      ContentType: "text/plain",
      Key: "test-shop/hello.txt",
    });
    expect(sentCommands[1]?.input).toMatchObject({
      Bucket: "product-export",
      ContentLength: 10 * 1024 * 1024,
      Key: "test-shop/hello.txt",
      PartNumber: 1,
      UploadId: "upload-1",
    });
    expect(sentCommands[2]?.input).toMatchObject({
      Bucket: "product-export",
      ContentLength: 2 * 1024 * 1024,
      Key: "test-shop/hello.txt",
      PartNumber: 2,
      UploadId: "upload-1",
    });
    expect(sentCommands[3]?.input).toEqual({
      Bucket: "product-export",
      Key: "test-shop/hello.txt",
      MultipartUpload: {
        Parts: [
          { ETag: "etag-1", PartNumber: 1 },
          { ETag: "etag-2", PartNumber: 2 },
        ],
      },
      UploadId: "upload-1",
    });
  });

  it("allows overriding the multipart part size while respecting the 5 MiB floor", async () => {
    const { S3CompatibleBucket } =
      await import("@/infra/bucket/process.s3-compatible");
    const bucket = new S3CompatibleBucket(
      {
        accessKeyId: "access_key",
        bucketName: "product-export",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
        secretAccessKey: "secret",
      },
      {
        partSizeBytes: 6 * 1024 * 1024,
      },
    );
    const bytes = new Uint8Array(13 * 1024 * 1024);

    await bucket.put({
      body: streamFromBytes(bytes),
      contentType: "text/plain",
      expiresAt: new Date(Date.now() + 1000),
      key: "test-shop/override.txt",
      maxBytes: bytes.byteLength,
      originalName: "override.txt",
      safeName: "override.txt",
      shopDomain: "test-shop.myshopify.com",
    });

    expect(
      sentCommands
        .filter((command) => command.type === "upload-part")
        .map((command) => command.input.ContentLength),
    ).toEqual([6 * 1024 * 1024, 6 * 1024 * 1024, 1024 * 1024]);
  });

  it("aborts S3-compatible multipart uploads when maxParts is exceeded", async () => {
    const { S3CompatibleBucket } =
      await import("@/infra/bucket/process.s3-compatible");
    const bucket = new S3CompatibleBucket(
      {
        accessKeyId: "access_key",
        bucketName: "product-export",
        endpoint: "https://account-id.r2.cloudflarestorage.com",
        secretAccessKey: "secret",
      },
      {
        partSizeBytes: 5 * 1024 * 1024,
      },
    );
    const bytes = new Uint8Array(11 * 1024 * 1024);

    await expect(
      bucket.put({
        body: streamFromBytes(bytes),
        contentType: "text/plain",
        expiresAt: new Date(Date.now() + 1000),
        key: "test-shop/max-parts.txt",
        maxBytes: bytes.byteLength,
        maxParts: 2,
        originalName: "max-parts.txt",
        safeName: "max-parts.txt",
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toMatchObject({
      status: 413,
    });

    expect(sentCommands.map((command) => command.type)).toEqual([
      "create-multipart",
      "upload-part",
      "upload-part",
      "abort-multipart",
    ]);
  });
});

function createCloudflareR2Config(): RuntimeConfig {
  const config = getRuntimeConfig({
    ...runtimeConfig,
    APP_BUCKET_PROVIDER: "r2",
    APP_BUCKET_R2_URL:
      "https://account-id.r2.cloudflarestorage.com/product-export",
    APP_CLOUDFLARE_USER_TOKEN: "token_value",
    APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
    APP_RUNTIME: "cloudflare",
  });

  return config;
}

function createNodeR2Config(): RuntimeConfig {
  const config = getRuntimeConfig({
    ...runtimeConfig,
    APP_BUCKET_PROVIDER: "r2",
    APP_BUCKET_R2_URL:
      "https://account-id.r2.cloudflarestorage.com/product-export",
    APP_CLOUDFLARE_USER_TOKEN: "token_value",
    APP_RUNTIME: "node",
  });

  return config;
}

type TestR2MultipartUpload = Omit<R2MultipartUpload, "complete"> & {
  complete: ReturnType<
    typeof vi.fn<(parts: R2UploadedPart[]) => Promise<R2Object>>
  >;
  uploadPart: ReturnType<
    typeof vi.fn<
      (
        partNumber: number,
        value: Parameters<R2MultipartUpload["uploadPart"]>[1],
      ) => Promise<R2UploadedPart>
    >
  >;
};

function createR2Binding(): R2Bucket {
  const r2Objects = new Map<string, Uint8Array>();
  return {
    createMultipartUpload: vi.fn((key: string) => {
      const uploadParts = new Map<number, Uint8Array>();
      const upload: TestR2MultipartUpload = {
        abort: vi.fn(() => Promise.resolve()),
        complete: vi.fn((parts: R2UploadedPart[]) => {
          const orderedParts = parts.toSorted(
            (left, right) => left.partNumber - right.partNumber,
          );
          const bytes = concatBytes(
            orderedParts.map((part) => {
              const value = uploadParts.get(part.partNumber);
              if (!value) {
                throwError(`Missing upload part ${part.partNumber}`);
              }

              return value;
            }),
          );
          r2Objects.set(key, bytes);

          return Promise.resolve({
            key,
            size: bytes.byteLength,
          } as R2Object);
        }),
        key,
        uploadId: "upload-1",
        uploadPart: vi.fn(async (partNumber, value) => {
          uploadParts.set(partNumber, await readR2UploadPart(value));

          return {
            etag: `etag-${partNumber}`,
            partNumber,
          };
        }),
      };

      return Promise.resolve(upload);
    }),
    delete: vi.fn((key: string) => {
      r2Objects.delete(key);
    }),
    get: vi.fn((key: string) => {
      const bytes = r2Objects.get(key);
      return bytes
        ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          ({
            body: streamFromBytes(bytes),
            size: bytes.byteLength,
          } as R2ObjectBody)
        : null;
    }),
    put: vi.fn(async (key: string, body: ReadableStream<Uint8Array>) => {
      r2Objects.set(key, await readBody(body));
      return null;
    }),
    resumeMultipartUpload: vi.fn(),
  } as unknown as R2Bucket;
}

async function getFirstR2MultipartUpload(
  bucket: R2Bucket,
): Promise<TestR2MultipartUpload> {
  const result = vi.mocked(bucket.createMultipartUpload).mock.results[0];
  if (!result || result.type !== "return") {
    throwError("Expected createMultipartUpload to be called");
  }

  return (await result.value) as TestR2MultipartUpload;
}

async function readBody(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

async function readR2UploadPart(
  value: Parameters<R2MultipartUpload["uploadPart"]>[1],
): Promise<Uint8Array> {
  if (value instanceof ReadableStream) {
    return readBody(value);
  }

  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((sum, part) => sum + part.byteLength, 0),
  );
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return streamFromBytes(new TextEncoder().encode(value));
}
