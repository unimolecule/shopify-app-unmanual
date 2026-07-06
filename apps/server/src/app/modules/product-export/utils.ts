import { DEFAULT_RUNTIMES } from "@shamt/app-env";
import {
  PRODUCT_EXPORT_PART_STATUS_VALUES,
  PRODUCT_EXPORT_STATUS_VALUES,
} from "@shamt/database/constants";
import { internalServerError } from "@/shared/exceptions";
import { PRODUCT_EXPORT_JSONL_CHUNK_BYTES } from "./queue/constants";
import type { ProductExportJobPayload } from "./queue";
import type { ProductExportPartRecord, ProductExportStatus } from "./types";
import type { RuntimeConfig } from "@/infra/env";

export const PRODUCT_EXPORT_STATUSES = {
  BULK_OPERATION_COMPLETED: PRODUCT_EXPORT_STATUS_VALUES[2],
  BULK_OPERATION_RUNNING: PRODUCT_EXPORT_STATUS_VALUES[1],
  CANCELED: PRODUCT_EXPORT_STATUS_VALUES[7],
  FAILED: PRODUCT_EXPORT_STATUS_VALUES[6],
  GENERATING_CSV: PRODUCT_EXPORT_STATUS_VALUES[3],
  QUEUED: PRODUCT_EXPORT_STATUS_VALUES[0],
  READY: PRODUCT_EXPORT_STATUS_VALUES[4],
  REQUIRES_NODE_FINALIZE: PRODUCT_EXPORT_STATUS_VALUES[5],
} as const;

export const PRODUCT_EXPORT_PART_STATUSES = {
  DONE: PRODUCT_EXPORT_PART_STATUS_VALUES[2],
  FAILED: PRODUCT_EXPORT_PART_STATUS_VALUES[3],
  PENDING: PRODUCT_EXPORT_PART_STATUS_VALUES[0],
  PROCESSING: PRODUCT_EXPORT_PART_STATUS_VALUES[1],
} as const;

export const PRODUCT_EXPORT_RETRYABLE_PART_STATUSES = [
  PRODUCT_EXPORT_PART_STATUSES.PENDING,
  PRODUCT_EXPORT_PART_STATUSES.FAILED,
] as const;

export const CSV_HEADER =
  "id,productId,title,handle,status,vendor,productType,createdAt,updatedAt\n";

const PRODUCT_EXPORT_DEFAULT_FILENAME = "products.csv";

/**
 * Checks runtime identity through app-env constants instead of hard-coded
 * strings. This keeps module code aligned with the shared runtime matrix.
 */
export function isCloudflareRuntime(
  config: Pick<RuntimeConfig, "APP_RUNTIME">,
) {
  return config.APP_RUNTIME === DEFAULT_RUNTIMES.CLOUDFLARE;
}

/**
 * Maps Shopify BulkOperation statuses into the product-export lifecycle.
 */
export function mapBulkOperationStatus(status: string): ProductExportStatus {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return PRODUCT_EXPORT_STATUSES.BULK_OPERATION_COMPLETED;
    case "CANCELED":
      return PRODUCT_EXPORT_STATUSES.CANCELED;
    case "FAILED":
    case "EXPIRED":
      return PRODUCT_EXPORT_STATUSES.FAILED;
    default:
      return PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING;
  }
}

/**
 * Builds the merchant-facing CSV filename from the saved export name.
 */
export function getProductExportFilename(name: string): string {
  const safeName = sanitizeProductExportFilename(name);
  if (!safeName) return PRODUCT_EXPORT_DEFAULT_FILENAME;
  if (safeName.toLowerCase().endsWith(".csv")) return safeName;
  return `${safeName}.csv`;
}

/**
 * Validates the minimal queue payload shared by all product-export jobs.
 *
 * Example: `{ exportId: "exp_1", shopDomain: "shop.myshopify.com", seq: 3 }`.
 */
export function parseProductExportJobPayload(
  payload: Record<string, unknown>,
): ProductExportJobPayload {
  if (
    typeof payload.exportId !== "string" ||
    typeof payload.shopDomain !== "string"
  ) {
    throw internalServerError("Invalid product export job payload", {
      details: {
        payload,
      },
      expose: true,
    });
  }

  return {
    exportId: payload.exportId,
    seq: typeof payload.seq === "number" ? payload.seq : undefined,
    shopDomain: payload.shopDomain,
  };
}

function sanitizeProductExportFilename(value: string): string {
  const LAST_C0_CONTROL_CODE_POINT = 31;
  const DELETE_CONTROL_CODE_POINT = 127;

  return value
    .normalize("NFKC")
    .replaceAll(/[\\/]/g, "-")
    .split("")
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        codePoint > LAST_C0_CONTROL_CODE_POINT &&
        codePoint !== DELETE_CONTROL_CODE_POINT
      );
    })
    .join("")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .slice(0, 251);
}

export type ProductExportCsvPartStreamResult = {
  body: ReadableStream<Uint8Array>;
  getRowCount: () => number;
};

/**
 * Streams Shopify JSONL bytes into CSV rows for one product-export part.
 *
 * The transform only buffers the current incomplete JSONL line. Completed rows
 * are emitted immediately, so large parts do not need `response.text()`.
 */
export function createProductExportCsvPartStream(
  jsonlStream: ReadableStream<Uint8Array>,
  part: ProductExportPartRecord,
): ProductExportCsvPartStreamResult {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = jsonlStream.getReader();
  let buffer = new Uint8Array(0);
  let offset = part.rangeStart;
  let rowCount = 0;

  return {
    body: new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (true) {
          const newlineIndex = buffer.indexOf(10);
          if (newlineIndex !== -1) {
            const lineStart = offset;
            const lineBytes = buffer.subarray(0, newlineIndex);
            buffer = buffer.subarray(newlineIndex + 1);
            offset += newlineIndex + 1;
            const line = decoder.decode(lineBytes);

            if (isLineInPartWindow(line, lineStart, part)) {
              rowCount += 1;
              // TODO: Defer evaluating a streaming JSON parser until the CSV
              // string hot path is no longer the dominant export cost.
              controller.enqueue(
                encoder.encode(productToCsvLine(JSON.parse(line))),
              );
              return;
            }

            continue;
          }

          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }

          buffer = concatBytes(buffer, value);
        }
      },
      async cancel(reason) {
        await reader.cancel(reason).catch(() => undefined);
      },
    }),
    getRowCount: () => rowCount,
  };
}

function concatBytes(
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  if (left.byteLength === 0) return new Uint8Array(right);
  const output = new Uint8Array(left.byteLength + right.byteLength);
  output.set(left);
  output.set(right, left.byteLength);
  return output;
}

export async function readProductExportCsvPartResult(
  result: ProductExportCsvPartStreamResult,
): Promise<{ body: ReadableStream<Uint8Array>; rowCount: number }> {
  const bytes = await new Response(result.body).arrayBuffer();

  return {
    body: new Response(bytes).body!,
    rowCount: result.getRowCount(),
  };
}

function isLineInPartWindow(
  line: string,
  lineStart: number,
  part: ProductExportPartRecord,
): boolean {
  const nominalStart = part.seq * PRODUCT_EXPORT_JSONL_CHUNK_BYTES;
  const nominalEnd = nominalStart + PRODUCT_EXPORT_JSONL_CHUNK_BYTES;

  return line.length > 0 && lineStart >= nominalStart && lineStart < nominalEnd;
}

/**
 * Projects the product fields selected by the Bulk Operation query into one
 * CSV row.
 */
function productToCsvLine(value: unknown): string {
  const product = value as {
    createdAt?: unknown;
    handle?: unknown;
    id?: unknown;
    productType?: unknown;
    status?: unknown;
    title?: unknown;
    updatedAt?: unknown;
    vendor?: unknown;
  };

  return `${csvCell(product.id)},${csvCell(
    readShopifyProductId(product.id),
  )},${csvCell(product.title)},${csvCell(product.handle)},${csvCell(
    product.status,
  )},${csvCell(product.vendor)},${csvCell(product.productType)},${csvCell(
    product.createdAt,
  )},${csvCell(product.updatedAt)}\n`;
}

function readShopifyProductId(value: unknown): string {
  if (typeof value !== "string") return "";

  const match = /^gid:\/\/shopify\/Product\/([^/]+)$/.exec(value);

  return match?.[1] ?? "";
}

/**
 * Escapes one CSV cell according to RFC 4180 style double-quote escaping.
 */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!text.includes('"')) return `"${text}"`;
  return `"${text.replaceAll('"', '""')}"`;
}
