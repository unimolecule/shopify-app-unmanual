import type { BucketProvider } from "@/infra/bucket";
import type { RuntimeConfig } from "@/infra/env";
import type { PaginatedPage, PaginationInput } from "@/shared/models";
import type { SelectPostgresFile } from "@shamt/database/entities";
import type { File as PlainFile } from "@shamt/database/entities/plain-zod-schema";
import type { Context } from "hono";

export type FileStatus = SelectPostgresFile["status"];

export type FileRecord = SelectPostgresFile & {
  bucketProvider: BucketProvider;
};

export type PublicFile = PlainFile;

export type FileLookup = {
  id: string;
  shopDomain: string;
};

export type FileListInput = {
  pagination: PaginationInput;
  shopDomain: string;
};

export type FilesPage = PaginatedPage & {
  files: FileRecord[];
};

export type FileStatusUpdate = FileLookup & {
  status: FileStatus;
  deletedAt?: Date;
};

export type FileDownloadInput = {
  file: FileRecord;
};

export type FileDownload =
  | { type: "stream"; body: ReadableStream<Uint8Array>; headers: HeadersInit }
  | { type: "redirect"; url: string; headers?: HeadersInit };

export interface FileDownloadResolver {
  resolve: (input: FileDownloadInput) => Promise<FileDownload>;
}

export type CreateFileInput = {
  batchId?: string;
  body: ReadableStream<Uint8Array> | null;
  contentType?: string;
  originalName?: string;
  runtimeEnv: RuntimeConfig;
  shopDomain: string;
};

export type CreateFilesInput = {
  runtimeEnv: RuntimeConfig;
  shopDomain: string;
};

export type ListFilesInput = {
  cursor?: string;
  limit?: number;
  page?: number;
  shopDomain: string;
};

export type ParsedFileUpload = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  originalName?: string;
};

export type ParseFileUploadInput = {
  fieldNames: string[];
  maxFiles: number;
  onFile: (file: ParsedFileUpload) => Promise<void>;
};

export interface FileUploadStreamParser {
  parse: (context: Context, input: ParseFileUploadInput) => Promise<void>;
}
