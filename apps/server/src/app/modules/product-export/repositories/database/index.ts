import type {
  ProductExportListInput,
  ProductExportLookup,
  ProductExportPartLookup,
  ProductExportPartRecord,
  ProductExportPartStats,
  ProductExportPartStatus,
  ProductExportRecord,
  ProductExportsPage,
} from "../../types";

export type ProductExportRepository = {
  create: (record: ProductExportRecord) => Promise<void>;
  createParts: (parts: ProductExportPartRecord[]) => Promise<void>;
  claimPart: (
    input: ProductExportPartLookup,
  ) => Promise<ProductExportPartRecord | null>;
  delete: (input: ProductExportLookup) => Promise<void>;
  findByBulkOperationId: (
    bulkOperationId: string,
  ) => Promise<ProductExportRecord | null>;
  findById: (input: ProductExportLookup) => Promise<ProductExportRecord | null>;
  getPartStats: (exportId: string) => Promise<ProductExportPartStats>;
  list: (input: ProductExportListInput) => Promise<ProductExportsPage>;
  listParts: (exportId: string) => Promise<ProductExportPartRecord[]>;
  listPartsPage: (input: {
    afterSeq?: number;
    exportId: string;
    limit: number;
  }) => Promise<ProductExportPartRecord[]>;
  listPartsByStatus: (input: {
    exportId: string;
    statuses: ProductExportPartStatus[];
  }) => Promise<ProductExportPartRecord[]>;
  listRecoverableExports: (input: {
    cursor?: {
      id: string;
      updatedAt: Date;
    };
    limit: number;
    olderThan: Date;
  }) => Promise<ProductExportRecord[]>;
  markPartDone: (
    input: ProductExportPartLookup & {
      bucketKey: string;
      bucketProvider: string;
      byteSize: number;
      rowCount: number;
    },
  ) => Promise<void>;
  markPartFailed: (
    input: ProductExportPartLookup & {
      errorCode: string;
      errorMessage: string;
    },
  ) => Promise<void>;
  update: (record: ProductExportRecord) => Promise<void>;
};
