import {
  DEFAULT_APP_BUCKET_PROVIDERS,
  type DEFAULT_APP_BUCKET_PROVIDERS_VALUES,
} from "@shamt/app-env";
import { runtimeCapabilities } from "@/app/runtime/runtime-capabilities";
import { badGatewayError, notFoundError } from "@/shared/exceptions";
import { toPaginationInput } from "@/shared/models";
import { parseNullableDate, readNullableNumber } from "@/utils";
import { enqueueProductExportJob } from "./queue";
import {
  PRODUCT_EXPORT_CSV_CONTENT_TYPE,
  PRODUCT_EXPORT_QUEUE_JOBS,
} from "./queue/constants";
import { listProductExportTemplates as listTemplates } from "./templates";
import {
  getProductExportFilename,
  mapBulkOperationStatus,
  PRODUCT_EXPORT_STATUSES,
} from "./utils";
import type { ProductExportRepository } from "./repositories/database";
import type {
  ListProductExportsInput,
  ProductExportCreateInput,
  ProductExportLookup,
  ProductExportRecord,
  ProductExportsPage,
} from "./types";
import type { FileDownload } from "@/app/modules/file/types";
import type { ShopifyClient } from "@/infra/provider";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

type BulkOperationRunQueryData = {
  bulkOperationRunQuery: {
    bulkOperation: {
      id: string;
      status: string;
    } | null;
    userErrors: Array<{
      field: string[] | null;
      message: string;
    }>;
  };
};

export type ProductExportBulkOperationFinishInput = {
  bulkOperationId: string;
  completedAt?: Date | null;
  errorCode?: string | null;
  fileSize?: number | null;
  objectCount?: number | null;
  partialDataUrl?: string | null;
  resultUrl?: string | null;
  shopDomain: string;
  status: string;
};

export type CompleteProductExportBulkOperationInput = {
  input: ProductExportBulkOperationFinishInput;
  repository: ProductExportRepository;
};

const PRODUCT_EXPORT_BULK_QUERY = `{
  products {
    edges {
      node {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
      }
    }
  }
}`;

/**
 * Creates export metadata and schedules the asynchronous Bulk Operation start.
 */
export async function createProductExport(
  c: Context<AppEnv>,
  input: ProductExportCreateInput,
): Promise<ProductExportRecord> {
  const now = new Date();
  const id = crypto.randomUUID();
  const repository = getProductExportsRepository(c);
  const record: ProductExportRecord = {
    bucketKey: null,
    bucketProvider: null,
    completedAt: null,
    createdAt: now,
    deletedAt: null,
    errorCode: null,
    errorMessage: null,
    fileSize: null,
    id,
    name: input.name,
    objectCount: null,
    partialDataUrl: null,
    resultUrl: null,
    shopDomain: input.shopDomain,
    shopifyBulkOperationId: null,
    shopifyBulkOperationStatus: null,
    shopifySessionId: null,
    status: PRODUCT_EXPORT_STATUSES.QUEUED,
    template: input.template,
    updatedAt: now,
  };

  await repository.create(record);
  await enqueueProductExportJob(c, PRODUCT_EXPORT_QUEUE_JOBS.START_BULK, {
    exportId: id,
    shopDomain: input.shopDomain,
  });

  return record;
}

/**
 * Lists exports scoped to one Shopify shop.
 */
export async function listProductExports(
  c: Context<AppEnv>,
  input: ListProductExportsInput,
): Promise<ProductExportsPage> {
  return await getProductExportsRepository(c).list({
    pagination: toPaginationInput(
      {
        cursor: input.cursor,
        limit: input.limit,
        page: input.page,
      },
      20,
    ),
    shopDomain: input.shopDomain,
    status: input.status,
  });
}

/**
 * Lists product export templates owned by the product-export module.
 */
export function listProductExportTemplates() {
  return listTemplates();
}

/**
 * Loads one export and raises a public 404 when it is missing.
 */
export async function getProductExport(
  c: Context<AppEnv>,
  input: ProductExportLookup,
): Promise<ProductExportRecord> {
  const record = await getProductExportsRepository(c).findById(input);

  if (!record) {
    throw notFoundError("Product export not found", {
      details: input,
      expose: true,
    });
  }

  return record;
}

/**
 * Soft-deletes an export after verifying ownership and existence.
 */
export async function deleteProductExport(
  c: Context<AppEnv>,
  input: ProductExportLookup,
): Promise<void> {
  await getProductExport(c, input);
  await getProductExportsRepository(c).delete(input);
}

/**
 * Resolves a ready product export into an authenticated CSV download.
 */
export async function downloadProductExport(
  c: Context<AppEnv>,
  shopDomain: string,
  id: string,
): Promise<FileDownload> {
  const record = await getProductExportsRepository(c).findById({
    id,
    shopDomain,
  });

  if (
    !record ||
    record.status !== PRODUCT_EXPORT_STATUSES.READY ||
    !record.bucketKey ||
    !record.bucketProvider
  ) {
    throw notFoundError("Product export file not found", {
      details: { id, shopDomain },
      expose: true,
    });
  }

  if (!isBucketProvider(record.bucketProvider)) {
    throw notFoundError("Product export file not found", {
      details: { id, shopDomain },
      expose: true,
    });
  }

  const resolver = await runtimeCapabilities(c).file.downloadResolver();
  const filename = getProductExportFilename(record.name);

  return resolver.resolve({
    file: {
      bucketKey: record.bucketKey,
      bucketProvider: record.bucketProvider,
      byteSize: record.fileSize ?? 0,
      contentType: PRODUCT_EXPORT_CSV_CONTENT_TYPE,
      createdAt: record.createdAt,
      deletedAt: null,
      expiresAt: record.completedAt ?? record.updatedAt,
      id: record.id,
      originalName: filename,
      safeName: filename,
      shopDomain: record.shopDomain,
      status: "available",
      updatedAt: record.updatedAt,
    },
  });
}

function isBucketProvider(
  value: string,
): value is DEFAULT_APP_BUCKET_PROVIDERS_VALUES {
  return Object.values(DEFAULT_APP_BUCKET_PROVIDERS).includes(
    value as DEFAULT_APP_BUCKET_PROVIDERS_VALUES,
  );
}

/**
 * Applies Shopify BulkOperation completion data to the matching export.
 *
 * This handler is idempotent: repeated webhooks update the same record.
 */
export async function completeProductExportBulkOperation({
  input,
  repository,
}: CompleteProductExportBulkOperationInput): Promise<ProductExportRecord | null> {
  const record = await repository.findByBulkOperationId(input.bulkOperationId);

  if (!record || record.shopDomain !== input.shopDomain) {
    return null;
  }

  const updated: ProductExportRecord = {
    ...record,
    completedAt: input.completedAt ?? record.completedAt,
    errorCode: input.errorCode ?? record.errorCode,
    fileSize: input.fileSize ?? record.fileSize,
    objectCount: input.objectCount ?? record.objectCount,
    partialDataUrl: input.partialDataUrl ?? record.partialDataUrl,
    resultUrl: input.resultUrl ?? record.resultUrl,
    shopifyBulkOperationStatus: input.status,
    status: mapBulkOperationStatus(input.status),
    updatedAt: new Date(),
  };

  await repository.update(updated);
  return updated;
}

/**
 * Starts Shopify's async Bulk Operation for an export record.
 */
export async function startProductExportBulkOperationForRecord(input: {
  client: ShopifyClient;
  record: ProductExportRecord;
  shopifySessionId: string;
  repository: ProductExportRepository;
}): Promise<ProductExportRecord> {
  if (input.record.shopifyBulkOperationId) return input.record;

  try {
    const bulkOperation = await startProductExportBulkOperation(input.client);
    const updated: ProductExportRecord = {
      ...input.record,
      shopifyBulkOperationId: bulkOperation.id,
      shopifyBulkOperationStatus: bulkOperation.status,
      shopifySessionId: input.shopifySessionId,
      status: PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING,
      updatedAt: new Date(),
    };

    await input.repository.update(updated);
    return updated;
  } catch (error) {
    const updated: ProductExportRecord = {
      ...input.record,
      errorMessage: error instanceof Error ? error.message : String(error),
      status: PRODUCT_EXPORT_STATUSES.FAILED,
      updatedAt: new Date(),
    };

    await input.repository.update(updated);
    throw error;
  }
}

/**
 * Fetches the latest BulkOperation result metadata by GraphQL ID.
 */
export async function fetchProductExportBulkOperation(
  client: ShopifyClient,
  id: string,
): Promise<{
  completedAt: Date | null;
  errorCode: string | null;
  fileSize: number | null;
  objectCount: number | null;
  partialDataUrl: string | null;
  resultUrl: string | null;
  status: string;
} | null> {
  const result = await client.request<{
    node: null | {
      completedAt: string | null;
      errorCode: string | null;
      fileSize: string | number | null;
      objectCount: string | number | null;
      partialDataUrl: string | null;
      status: string;
      url: string | null;
    };
  }>(
    `query ProductExportBulkOperation($id: ID!) {
      node(id: $id) {
        ... on BulkOperation {
          status
          url
          partialDataUrl
          objectCount
          fileSize
          errorCode
          completedAt
        }
      }
    }`,
    {
      variables: { id },
    },
  );

  if (result.errors) {
    throw badGatewayError("Failed to fetch product export bulk operation", {
      details: { errors: result.errors },
    });
  }

  const node = result.data?.node;
  if (!node) return null;

  return {
    completedAt: parseNullableDate(node.completedAt),
    errorCode: node.errorCode,
    fileSize: readNullableNumber(node.fileSize),
    objectCount: readNullableNumber(node.objectCount),
    partialDataUrl: node.partialDataUrl,
    resultUrl: node.url,
    status: node.status,
  };
}

/**
 * Resolves the product-export repository from the active runtime capability.
 */
export function getProductExportsRepository(
  c: Context<AppEnv>,
): ProductExportRepository {
  return runtimeCapabilities(c).database.repositories.productExports();
}

/**
 * Runs the Shopify Admin GraphQL mutation that creates the Bulk Operation.
 */
async function startProductExportBulkOperation(
  client: ShopifyClient,
): Promise<{ id: string; status: string }> {
  const result = await client.request<BulkOperationRunQueryData>(
    `mutation ProductExportBulkOperation($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        query: PRODUCT_EXPORT_BULK_QUERY,
      },
    },
  );

  if (result.errors) {
    throw badGatewayError("Failed to start product export bulk operation", {
      details: { errors: result.errors },
    });
  }

  const payload = result.data?.bulkOperationRunQuery;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0 || !payload?.bulkOperation) {
    throw badGatewayError("Product export bulk operation was rejected", {
      details: { userErrors },
      expose: true,
    });
  }

  return payload.bulkOperation;
}
