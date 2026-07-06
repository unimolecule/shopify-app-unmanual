import { DEFAULT_APP_DATABASE_PROVIDERS } from "@shamt/app-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BucketFileDownloadResolver } from "@/app/modules/file/download";
import { createPostgresFilesRepository } from "@/app/modules/file/repositories/database/postgres";
import { createSqliteFilesRepository } from "@/app/modules/file/repositories/database/sqlite";
import {
  createFile,
  createFiles,
  deleteFile,
  downloadFile,
  getFile,
  listFiles,
} from "@/app/modules/file/service";
import { DEFAULT_SIGNED_DOWNLOAD_URL_EXPIRE } from "@/constants";
import { createSeekCursor } from "@/shared/models";
import { throwAppServerError as throwError } from "../internal";
import {
  createMockRuntimeCapabilities,
  runtimeConfig,
} from "./shopify/test-utils";
import type { FilesRepository } from "@/app/modules/file/repositories/database";
import type {
  FileDownloadResolver,
  FileRecord,
} from "@/app/modules/file/types";
import type {
  Bucket,
  BucketDownloadSigner,
  BucketReadableObject,
  BucketStoredObject,
} from "@/infra/bucket";
import type { Database } from "@/infra/database";
import type { RuntimeConfig } from "@/infra/env";

describe("file service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates, downloads, and deletes a file through runtime capabilities", async () => {
    const repository = createMemoryMetadataRepository();
    const bucket = createMemoryBucket();
    const resolver: FileDownloadResolver = {
      resolve: vi.fn(async ({ file }) => ({
        type: "stream" as const,
        body: (await bucket.open({ key: file.bucketKey })).body,
        headers: {
          "Content-Type": file.contentType,
        },
      })),
    };
    const c = createServiceContext({ bucket, resolver, repository });

    const created = await createFile(c, {
      body: streamFromText("hello"),
      contentType: "text/plain",
      originalName: "import-report-2026-06-03-112151.csv",
      runtimeEnv: runtimeConfig,
      shopDomain: "test-shop.myshopify.com",
    });

    expect(created).toMatchObject({
      byteSize: 5,
      contentType: "text/plain",
      originalName: "import-report-2026-06-03-112151.csv",
      safeName: "import-report.csv",
      status: "available",
    });

    const metadata = await getFile(c, "test-shop.myshopify.com", created.id);
    expect(metadata.id).toBe(created.id);

    const download = await downloadFile(
      c,
      "test-shop.myshopify.com",
      created.id,
    );
    expect(download.type).toBe("stream");
    expect(resolver.resolve).toHaveBeenCalledTimes(1);

    await deleteFile(c, "test-shop.myshopify.com", created.id);
    await expect(
      getFile(c, "test-shop.myshopify.com", created.id),
    ).rejects.toMatchObject({
      status: 404,
      message: "File not found",
    });
  });

  it("supports Cloudflare D1 database-backed file metadata", async () => {
    const repository = createMemoryMetadataRepository(
      DEFAULT_APP_DATABASE_PROVIDERS.D1,
    );
    const bucket = createMemoryBucket();
    const c = createServiceContext({
      bucket,
      repository,
      runtimeEnv: {
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      },
    });

    const created = await createFile(c, {
      body: streamFromText("hello d1"),
      contentType: "text/plain",
      originalName: "cloudflare-d1.txt",
      runtimeEnv: {
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
        APP_DATABASE_PROVIDER: DEFAULT_APP_DATABASE_PROVIDERS.D1,
        APP_RUNTIME: "cloudflare",
      },
      shopDomain: "cloudflare-shop.myshopify.com",
    });

    expect(created).toMatchObject({
      byteSize: 8,
      originalName: "cloudflare-d1.txt",
      status: "available",
    });

    await expect(
      getFile(c, "cloudflare-shop.myshopify.com", created.id),
    ).resolves.toMatchObject({
      id: created.id,
      status: "available",
    });

    await deleteFile(c, "cloudflare-shop.myshopify.com", created.id);
    await expect(
      getFile(c, "cloudflare-shop.myshopify.com", created.id),
    ).rejects.toMatchObject({
      status: 404,
      message: "File not found",
    });
  });

  it("returns a signed redirect for R2 downloads", async () => {
    const repository = createMemoryMetadataRepository();
    const signer: BucketDownloadSigner = {
      signDownloadUrl: vi.fn(
        async () =>
          await Promise.resolve("https://signed.example.com/file.csv"),
      ),
    };
    const c = createServiceContext({
      resolver: new BucketFileDownloadResolver(createMemoryBucket(), signer),
      repository,
    });
    const file: FileRecord = {
      id: "file_r2",
      shopDomain: "test-shop.myshopify.com",
      originalName: "file.csv",
      safeName: "file.csv",
      contentType: "text/csv",
      byteSize: 5,
      bucketProvider: "r2",
      bucketKey: "test-shop/file.csv",
      status: "available",
      expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    await repository.create(file);

    const download = await downloadFile(c, "test-shop.myshopify.com", file.id);

    expect(download).toEqual({
      type: "redirect",
      url: "https://signed.example.com/file.csv",
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
    expect(signer.signDownloadUrl).toHaveBeenCalledWith({
      contentType: "text/csv",
      expiresInMilliseconds: DEFAULT_SIGNED_DOWNLOAD_URL_EXPIRE,
      key: "test-shop/file.csv",
      originalName: "file.csv",
    });
  });

  it("marks expired files unavailable during read", async () => {
    const repository = createMemoryMetadataRepository();
    const c = createServiceContext({ repository });
    const expired: FileRecord = {
      id: "file_expired",
      shopDomain: "test-shop.myshopify.com",
      originalName: "expired.txt",
      safeName: "expired.txt",
      contentType: "text/plain",
      byteSize: 7,
      bucketProvider: "memory",
      bucketKey: "test-shop.myshopify.com/expired.txt",
      status: "available",
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await repository.create(expired);

    await expect(
      getFile(c, "test-shop.myshopify.com", expired.id),
    ).rejects.toMatchObject({
      status: 410,
      message: "File expired",
    });
    await expect(
      getFile(c, "test-shop.myshopify.com", expired.id),
    ).rejects.toMatchObject({
      status: 404,
      message: "File not found",
    });
  });

  it("marks upload failures as failed", async () => {
    const repository = createMemoryMetadataRepository();
    const bucket = createMemoryBucket({
      put: () => {
        throwError("write failed");
      },
    });
    const c = createServiceContext({ bucket, repository });

    await expect(
      createFile(c, {
        body: streamFromText("hello"),
        contentType: "text/plain",
        originalName: "hello.txt",
        runtimeEnv: runtimeConfig,
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toThrow("write failed");

    const page = await repository.list({
      pagination: { limit: 10, mode: "cursor" },
      shopDomain: "test-shop.myshopify.com",
    });
    expect(page.files).toEqual([]);
  });

  it("creates multiple files sequentially", async () => {
    const repository = createMemoryMetadataRepository();
    const c = createServiceContext({ repository });
    //@ts-ignore
    c.req = createRequestContext([
      ["files", new File(["hello"], "hello.txt", { type: "text/plain" })],
      ["files[]", new File(["world"], "world.txt", { type: "text/plain" })],
    ]);

    const result = await createFiles(c, {
      runtimeEnv: runtimeConfig,
      shopDomain: "test-shop.myshopify.com",
    });

    expect(result.files).toHaveLength(2);
    expect(result.files.map((file) => file.originalName)).toEqual([
      "hello.txt",
      "world.txt",
    ]);
    expect(result.files.every((file) => file.status === "available")).toBe(
      true,
    );

    const page = await repository.list({
      pagination: { limit: 10, mode: "cursor" },
      shopDomain: "test-shop.myshopify.com",
    });
    const directories = new Set(
      page.files.map((file) =>
        file.bucketKey.split("/").slice(0, -1).join("/"),
      ),
    );
    expect(directories.size).toBe(1);
  });

  it("lists files with page pagination metadata", async () => {
    const repository = createMemoryMetadataRepository();
    const c = createServiceContext({ repository });

    for (let index = 0; index < 25; index += 1) {
      await repository.create(
        createFileRecord({
          id: `file_${index.toString().padStart(2, "0")}`,
          createdAt: new Date(Date.UTC(2026, 5, 20, 0, index)),
          originalName: `file-${index}.txt`,
        }),
      );
    }

    const result = await listFiles(c, {
      limit: 20,
      page: 2,
      shopDomain: "test-shop.myshopify.com",
    });

    expect(result.files).toHaveLength(5);
    expect(result.files[0]?.id).toBe("file_04");
    expect(result.pagination).toEqual({
      hasNext: false,
      limit: 20,
      mode: "page",
      page: 2,
      total: 25,
    });
  });

  it("continues file lists after the cursor resource", async () => {
    const repository = createMemoryMetadataRepository();
    const c = createServiceContext({ repository });

    for (let index = 0; index < 5; index += 1) {
      await repository.create(
        createFileRecord({
          id: `file_${index}`,
          createdAt: new Date(Date.UTC(2026, 5, 20, 0, index)),
        }),
      );
    }

    const firstPage = await listFiles(c, {
      limit: 2,
      shopDomain: "test-shop.myshopify.com",
    });
    const secondPage = await listFiles(c, {
      cursor:
        firstPage.pagination.mode === "cursor"
          ? firstPage.pagination.nextCursor
          : undefined,
      limit: 2,
      shopDomain: "test-shop.myshopify.com",
    });

    expect(firstPage.files.map((file) => file.id)).toEqual([
      "file_4",
      "file_3",
    ]);
    expect(firstPage.pagination).toEqual({
      hasNext: true,
      limit: 2,
      mode: "cursor",
      nextCursor: createSeekCursor({
        createdAt: new Date(Date.UTC(2026, 5, 20, 0, 3)),
        id: "file_3",
      }),
    });
    expect(secondPage.files.map((file) => file.id)).toEqual([
      "file_2",
      "file_1",
    ]);
  });

  it("rejects empty multi-file uploads", async () => {
    const c = createServiceContext({});
    //@ts-ignore
    c.req = createRequestContext([]);

    await expect(
      createFiles(c, {
        runtimeEnv: runtimeConfig,
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "At least one file is required",
    });
  });
});

function createServiceContext(options: {
  resolver?: FileDownloadResolver;
  bucket?: Bucket;
  database?: Database;
  repository?: TestFilesRepository;
  runtimeEnv?: RuntimeConfig;
}) {
  const runtimeEnv = options.runtimeEnv ?? runtimeConfig;
  const repository =
    options.repository ??
    createMemoryMetadataRepository(runtimeEnv.APP_DATABASE_PROVIDER);
  const database = options.database ?? repository.database;
  const bucket = options.bucket ?? createMemoryBucket();
  const resolver =
    options.resolver ??
    ({
      resolve: vi.fn(() =>
        Promise.resolve({
          type: "redirect",
          url: "https://files.example.com/file",
        } as const),
      ),
    } satisfies FileDownloadResolver);

  const runtimeCapabilities = createMockRuntimeCapabilities({
    database: {
      create: () => database,
      repositories: {
        files: () => repository,
      },
    },
    bucket: () => bucket,
    file: {
      downloadResolver: () => resolver,
    },
  });

  const context: Pick<Parameters<typeof createFile>[0], "get"> = {
    get: (key: string) => {
      if (key === "runtimeEnv") return runtimeEnv;
      if (key === "runtimeCapabilities") return runtimeCapabilities;
      if (key === "requestId") return "req_test";
      return;
    },
  };

  return context as Parameters<typeof createFile>[0];
}

type TestFilesRepository = FilesRepository & {
  database: Database;
};

function createMemoryMetadataRepository(
  provider: Database["provider"] = DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
): TestFilesRepository {
  const database = createMemoryFilesDatabase(provider);
  const repository =
    provider === DEFAULT_APP_DATABASE_PROVIDERS.D1
      ? createSqliteFilesRepository(database as never)
      : createPostgresFilesRepository(database as never);

  return Object.assign(repository, { database });
}

function createMemoryFilesDatabase(
  provider: Database["provider"] = DEFAULT_APP_DATABASE_PROVIDERS.POSTGRES,
): Database {
  const rows = new Map<string, FileRecord>();

  const db = {
    insert: () => ({
      values: (value: FileRecord) => ({
        onConflictDoUpdate: () => {
          rows.set(value.id, cloneFile(value));
          return Promise.resolve();
        },
      }),
    }),
    select: (shape?: Record<string, unknown>) => ({
      from: () => ({
        where: (condition: unknown) => {
          const predicates = collectSqlPredicates(condition);
          const selectRows = (ordered: boolean, limit: number, offset = 0) => {
            const files = [...rows.values()]
              .filter((file) => matchesSqlPredicates(file, predicates))
              .toSorted((a, b) => {
                if (!ordered) return 0;
                const createdAtOrder =
                  b.createdAt.getTime() - a.createdAt.getTime();
                return createdAtOrder || b.id.localeCompare(a.id);
              })
              .slice(offset, offset + limit)
              .map(cloneFile);

            return Promise.resolve(files);
          };
          const selectCount = () =>
            Promise.resolve([
              {
                total: [...rows.values()].filter((file) =>
                  matchesSqlPredicates(file, predicates),
                ).length,
              },
            ]);

          if (isCountSelectShape(shape)) return selectCount();

          return {
            limit: (limit: number) => selectRows(false, limit),
            orderBy: () => ({
              limit: (limit: number) =>
                withOffset(selectRows(true, limit), {
                  offset: (offset: number) => selectRows(true, limit, offset),
                }),
            }),
          };
        },
      }),
    }),
    update: () => ({
      set: (value: Partial<FileRecord>) => ({
        where: (condition: unknown) => {
          const predicates = collectSqlPredicates(condition);

          for (const file of rows.values()) {
            if (!matchesSqlPredicates(file, predicates)) continue;

            rows.set(file.id, {
              ...file,
              ...value,
              deletedAt: value.deletedAt ?? file.deletedAt,
            });
          }

          return Promise.resolve();
        },
      }),
    }),
  };

  if (provider === DEFAULT_APP_DATABASE_PROVIDERS.D1) {
    return {
      check: () =>
        Promise.resolve({
          dialect: "sqlite",
          latencyMs: 0,
          provider,
          runtime: "cloudflare",
          status: "ok" as const,
        }),
      db: db as never,
      dialect: "sqlite",
      provider,
      runtime: "cloudflare",
    };
  }

  return {
    check: () =>
      Promise.resolve({
        dialect: "postgres",
        latencyMs: 0,
        provider,
        runtime: runtimeConfig.APP_RUNTIME,
        status: "ok" as const,
      }),
    db: db as never,
    dialect: "postgres",
    dispose: () => Promise.resolve(),
    provider,
    runtime: runtimeConfig.APP_RUNTIME,
  };
}

function cloneFile(file: FileRecord): FileRecord {
  return {
    ...file,
    createdAt: new Date(file.createdAt),
    deletedAt: file.deletedAt ? new Date(file.deletedAt) : null,
    expiresAt: new Date(file.expiresAt),
    updatedAt: new Date(file.updatedAt),
  };
}

function createFileRecord(overrides: Partial<FileRecord>): FileRecord {
  const now = new Date(Date.UTC(2026, 5, 20));

  return {
    id: "file_test",
    shopDomain: "test-shop.myshopify.com",
    originalName: "file.txt",
    safeName: "file.txt",
    contentType: "text/plain",
    byteSize: 1,
    bucketProvider: "memory",
    bucketKey: "test-shop.myshopify.com/file.txt",
    status: "available",
    expiresAt: new Date(Date.UTC(2026, 5, 21)),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function createMemoryBucket(overrides: Partial<Bucket> = {}): Bucket {
  const objects = new Map<string, Uint8Array>();

  return {
    async put(input): Promise<BucketStoredObject> {
      const bytes = await readAllBytes(input.body);
      objects.set(input.key, bytes);
      return {
        byteSize: bytes.byteLength,
        key: input.key,
        provider: input.shopDomain.includes("cloudflare") ? "r2" : "memory",
      };
    },
    open(input): Promise<BucketReadableObject> {
      const bytes = objects.get(input.key) ?? new Uint8Array();
      return Promise.resolve({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        byteSize: bytes.byteLength,
      });
    },
    delete(input) {
      objects.delete(input.key);
      return Promise.resolve();
    },
    ...overrides,
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

function createRequestContext(entries: [string, File][]) {
  const formData = new FormData();

  for (const [key, value] of entries) {
    formData.append(key, value);
  }

  const request = new Request("https://example.test/api/files", {
    method: "POST",
    body: formData,
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    raw: request,
  } as Parameters<typeof createFile>[0]["req"];
}

type SqlPredicate =
  | {
      field: keyof FileRecord;
      operator: "=" | "<" | "<>";
      value: unknown;
    }
  | {
      field: keyof FileRecord;
      operator: "is null";
    };
type SqlValuePredicate = Extract<SqlPredicate, { value: unknown }>;

function collectSqlPredicates(value: unknown): SqlPredicate[] {
  if (!isSqlLike(value)) return [];

  const chunks = value.queryChunks;
  const simplePredicate = toSimpleSqlPredicate(chunks);
  if (simplePredicate) return [simplePredicate];

  return chunks.flatMap(collectSqlPredicates);
}

function toSimpleSqlPredicate(chunks: unknown[]): SqlPredicate | undefined {
  const field = toFileRecordField(chunks[1]);
  const operator = toSqlOperator(chunks[2]);

  if (!field || !operator) return undefined;

  if (operator === "is null") {
    return { field, operator };
  }

  return {
    field,
    operator,
    value: isSqlParam(chunks[3]) ? chunks[3].value : undefined,
  };
}

function matchesSqlPredicates(
  file: FileRecord,
  predicates: SqlPredicate[],
): boolean {
  const seek = toCursorSeek(predicates);
  const normalPredicates = seek
    ? predicates.filter((predicate) => !seek.predicates.includes(predicate))
    : predicates;

  if (seek && !matchesCursorSeek(file, seek)) return false;

  return normalPredicates.every((predicate) => {
    if (predicate.operator === "is null") {
      return (
        file[predicate.field] === null || file[predicate.field] === undefined
      );
    }

    if (predicate.operator === "=") {
      return areSqlValuesEqual(file[predicate.field], predicate.value);
    }

    if (predicate.operator === "<") {
      return compareSqlValues(file[predicate.field], predicate.value) < 0;
    }

    return file[predicate.field] !== predicate.value;
  });
}

function toFileRecordField(value: unknown): keyof FileRecord | undefined {
  if (!isColumnLike(value)) return undefined;

  const fieldByColumnName = {
    bucket_key: "bucketKey",
    bucket_provider: "bucketProvider",
    byte_size: "byteSize",
    content_type: "contentType",
    created_at: "createdAt",
    deleted_at: "deletedAt",
    expires_at: "expiresAt",
    id: "id",
    original_name: "originalName",
    safe_name: "safeName",
    shop_domain: "shopDomain",
    status: "status",
    updated_at: "updatedAt",
  } satisfies Record<string, keyof FileRecord>;

  return fieldByColumnName[value.name as keyof typeof fieldByColumnName];
}

function toSqlOperator(value: unknown): SqlPredicate["operator"] | undefined {
  if (!isStringChunkLike(value)) return undefined;

  const text = value.value.join("").trim().toLowerCase();
  if (text === "=" || text === "<" || text === "<>" || text === "is null") {
    return text;
  }
  return undefined;
}

function toCursorSeek(predicates: SqlPredicate[]) {
  const createdAtBefore = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "createdAt" && predicate.operator === "<",
  );
  const createdAtEqual = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "createdAt" && predicate.operator === "=",
  );
  const idBefore = predicates.find(
    (predicate): predicate is SqlValuePredicate =>
      predicate.field === "id" && predicate.operator === "<",
  );

  if (!createdAtBefore || !createdAtEqual || !idBefore) return;

  const seekPredicates: SqlPredicate[] = [
    createdAtBefore,
    createdAtEqual,
    idBefore,
  ];

  return {
    createdAtBefore,
    createdAtEqual,
    idBefore,
    predicates: seekPredicates,
  };
}

function matchesCursorSeek(
  file: FileRecord,
  seek: NonNullable<ReturnType<typeof toCursorSeek>>,
): boolean {
  return (
    compareSqlValues(file.createdAt, seek.createdAtBefore.value) < 0 ||
    (areSqlValuesEqual(file.createdAt, seek.createdAtEqual.value) &&
      compareSqlValues(file.id, seek.idBefore.value) < 0)
  );
}

function areSqlValuesEqual(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }

  return left === right;
}

function compareSqlValues(left: unknown, right: unknown): number {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }

  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue.localeCompare(rightValue);
  }

  return 0;
}

function withOffset<T>(
  promise: Promise<T>,
  extension: {
    offset: (offset: number) => Promise<T>;
  },
): Promise<T> & typeof extension {
  return Object.assign(promise, extension);
}

function isSqlLike(value: unknown): value is { queryChunks: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "queryChunks" in value &&
    Array.isArray(value.queryChunks)
  );
}

function isColumnLike(value: unknown): value is { name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function isStringChunkLike(value: unknown): value is { value: string[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    Array.isArray(value.value)
  );
}

function isSqlParam(value: unknown): value is { value: unknown } {
  return typeof value === "object" && value !== null && "value" in value;
}

function isCountSelectShape(value: unknown): value is { total: unknown } {
  return typeof value === "object" && value !== null && "total" in value;
}

async function readAllBytes(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    byteLength += value.byteLength;
  }

  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}
