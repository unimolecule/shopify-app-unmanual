import { shopifyClient } from "@/utils/client.shopify";
import type { ApiResponse, JsonSerializedDates } from "@/typings/json-api";
import type { SelectPostgresFile } from "@shamt/database/entities";

export type FileResource = JsonSerializedDates<
  SelectPostgresFile,
  "createdAt" | "deletedAt" | "expiresAt" | "updatedAt"
>;

/**
 * Uploads a raw file body to the backend file module.
 */
export function uploadFile(file: File, signal?: AbortSignal) {
  const headers = new Headers();
  headers.set("Content-Type", file.type || "application/octet-stream");
  headers.set("X-File-Name", file.name);

  return shopifyClient.post<ApiResponse<FileResource>, File>("files", file, {
    headers,
    signal,
  });
}
