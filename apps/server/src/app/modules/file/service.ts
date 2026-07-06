import { runtimeCapabilities } from "@/app/runtime/runtime-capabilities";
import { getBucketEnvConfig, type Bucket } from "@/infra/bucket";
import { badRequestError, goneError, notFoundError } from "@/shared/exceptions";
import { PAGINATION_LIMIT_MAX, toPaginationInput } from "@/shared/models";
import { getFileUploadStreamParser } from "./upload-stream-parser";
import {
  createBucketKey,
  normalizeContentType,
  normalizeOriginalName,
  sanitizeFilename,
  toPublicFile,
} from "./utils";
import type { FilesRepository } from "./repositories/database";
import type {
  CreateFileInput,
  CreateFilesInput,
  FileDownload,
  FileRecord,
  FilesPage,
  ListFilesInput,
  PublicFile,
} from "./types";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

/**
 * Creates one file resource by first writing metadata, then streaming bytes to
 * the active bucket, and finally marking the metadata as available.
 */
export async function createFile(
  c: Context<AppEnv>,
  input: CreateFileInput,
): Promise<PublicFile> {
  if (!input.body) throw badRequestError("File body is required");

  const originalName = normalizeOriginalName(input.originalName);
  const safeName = sanitizeFilename(originalName);
  const contentType = normalizeContentType(input.contentType);
  const now = new Date();
  const id = crypto.randomUUID();
  const bucketDirId = input.batchId ?? id;
  const expiresAt = new Date(now.getTime() + input.runtimeEnv.APP_FILE_EXPIRE);
  const bucketKey = createBucketKey({
    id: bucketDirId,
    safeName,
    shopDomain: input.shopDomain,
    now,
  });
  const bucketProvider = getBucketEnvConfig(input.runtimeEnv).provider;
  const repository = getFilesRepository(c);
  const bucket = await getFileBucket(c);

  const initialFile: FileRecord = {
    id,
    shopDomain: input.shopDomain,
    originalName,
    safeName,
    contentType,
    byteSize: 0,
    bucketProvider,
    bucketKey,
    status: "uploading",
    expiresAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await repository.create(initialFile);

  try {
    const stored = await bucket.put({
      body: input.body,
      contentType,
      expiresAt,
      key: bucketKey,
      maxBytes: input.runtimeEnv.APP_FILE_MAX_SIZE,
      originalName,
      safeName,
      shopDomain: input.shopDomain,
    });
    const file: FileRecord = {
      ...initialFile,
      byteSize: stored.byteSize,
      bucketProvider: stored.provider,
      bucketKey: stored.key,
      status: "available",
      updatedAt: new Date(),
    };

    await repository.create(file);
    return toPublicFile(file);
  } catch (error) {
    await repository.updateStatus({
      id,
      shopDomain: input.shopDomain,
      status: "failed",
    });
    throw error;
  }
}

/**
 * Creates multiple file resources from one multipart request.
 * All files in the request share the same bucket directory id while keeping
 * independent file resource ids.
 */
export async function createFiles(
  c: Context<AppEnv>,
  input: CreateFilesInput,
): Promise<{ files: PublicFile[] }> {
  const files: PublicFile[] = [];
  const batchId = crypto.randomUUID();
  const parser = getFileUploadStreamParser();

  try {
    await parser.parse(c, {
      fieldNames: ["files", "files[]"],
      maxFiles: input.runtimeEnv.APP_FILE_UPLOAD_MULTIPLE_SIZE,
      onFile: async (file) => {
        files.push(
          await createFile(c, {
            batchId,
            body: file.body,
            contentType: file.contentType,
            originalName: file.originalName,
            runtimeEnv: input.runtimeEnv,
            shopDomain: input.shopDomain,
          }),
        );
      },
    });
  } catch (error) {
    await Promise.allSettled(
      files.map((file) => deleteFile(c, input.shopDomain, file.id)),
    );
    throw error;
  }

  if (files.length === 0) {
    throw badRequestError("At least one file is required");
  }

  return { files };
}

/**
 * Lists non-deleted and non-failed files for the current shop.
 */
export async function listFiles(
  c: Context<AppEnv>,
  input: ListFilesInput,
): Promise<{ files: PublicFile[]; pagination: FilesPage["pagination"] }> {
  const page = await getFilesRepository(c).list({
    pagination: toPaginationInput(
      {
        cursor: input.cursor,
        limit: input.limit,
        page: input.page,
      },
      PAGINATION_LIMIT_MAX,
    ),
    shopDomain: input.shopDomain,
  });

  return {
    files: page.files.map(toPublicFile),
    pagination: page.pagination,
  };
}

/**
 * Returns one available file metadata resource for the current shop.
 */
export async function getFile(
  c: Context<AppEnv>,
  shopDomain: string,
  id: string,
): Promise<PublicFile> {
  const file = await getAvailableFile(c, shopDomain, id);
  return toPublicFile(file);
}

/**
 * Resolves a file download into either a stream response or signed redirect.
 */
export async function downloadFile(
  c: Context<AppEnv>,
  shopDomain: string,
  id: string,
): Promise<FileDownload> {
  const file = await getAvailableFile(c, shopDomain, id);
  return (await getFileDownloadResolver(c)).resolve({ file });
}

/**
 * Deletes the bucket object and then soft-deletes its metadata row.
 */
export async function deleteFile(
  c: Context<AppEnv>,
  shopDomain: string,
  id: string,
): Promise<void> {
  const repository = getFilesRepository(c);
  const file = await repository.findById({ id, shopDomain });
  if (!file || file.deletedAt || file.status === "deleted") {
    throw notFoundError("File not found");
  }

  await (await getFileBucket(c)).delete({ key: file.bucketKey });
  await repository.delete({ id, shopDomain });
}

/**
 * Loads an available, non-expired file and enforces shop isolation.
 */
async function getAvailableFile(
  c: Context<AppEnv>,
  shopDomain: string,
  id: string,
): Promise<FileRecord> {
  const repository = getFilesRepository(c);
  const file = await repository.findById({ id, shopDomain });

  if (!file || file.deletedAt || file.status === "deleted") {
    throw notFoundError("File not found");
  }

  if (file.status !== "available") {
    throw notFoundError("File not found");
  }

  if (file.expiresAt.getTime() <= Date.now()) {
    await repository.updateStatus({ id, shopDomain, status: "expired" });
    throw goneError("File expired");
  }

  return file;
}

/**
 * Builds the module-owned files repository from the shared database capability.
 */
function getFilesRepository(c: Context<AppEnv>): FilesRepository {
  return runtimeCapabilities(c).database.repositories.files();
}

/**
 * Resolves the active object bucket through the shared bucket capability.
 */
function getFileBucket(c: Context<AppEnv>): Bucket | Promise<Bucket> {
  return runtimeCapabilities(c).bucket();
}

/**
 * Resolves the runtime download resolver for stream or signed URL downloads.
 */
function getFileDownloadResolver(c: Context<AppEnv>) {
  return runtimeCapabilities(c).file.downloadResolver();
}
