import type { ProductExportTemplateCode } from "./templates";
import type { RuntimeConfig } from "@/infra/env";
import type { PaginatedPage, PaginationInput } from "@/shared/models";
import type {
  SelectPostgresProductExport,
  SelectPostgresProductExportPart,
} from "@unimolecule/shopify-app-unmanual-database/entities";

export type ProductExportRecord = SelectPostgresProductExport;
export type ProductExportPartRecord = SelectPostgresProductExportPart;
export type ProductExportStatus = ProductExportRecord["status"];
export type ProductExportPartStatus = ProductExportPartRecord["status"];

export type ProductExportsPage = PaginatedPage & {
  productExports: ProductExportRecord[];
};

export type ProductExportListInput = {
  pagination: PaginationInput;
  shopDomain: string;
  status?: ProductExportStatus;
};

export type ListProductExportsInput = {
  cursor?: string;
  limit?: number;
  page?: number;
  shopDomain: string;
  status?: ProductExportStatus;
};

export type ProductExportLookup = {
  id: string;
  shopDomain: string;
};

export type ProductExportPartLookup = {
  exportId: string;
  seq: number;
};

export type ProductExportCreateInput = {
  name: string;
  runtimeEnv: RuntimeConfig;
  shopDomain: string;
  template: ProductExportTemplateCode;
};

export type ProductExportPartStats = {
  done: number;
  failed: number;
  pending: number;
  processing: number;
  total: number;
};
