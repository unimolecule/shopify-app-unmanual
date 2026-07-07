import { DEFAULT_APP_BUCKET_PROVIDERS } from "@unimolecule/shopify-app-unmanual-app-env/constants";
import { z } from "zod";
import {
  FILE_STATUS_VALUES,
  PRODUCT_EXPORT_PART_STATUS_VALUES,
  PRODUCT_EXPORT_STATUS_VALUES,
  PRODUCT_EXPORT_TEMPLATE_CODE_VALUES,
} from "../../constants";

const isoDateTimeSchema = z.iso.datetime();
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();

const nullableStringSchema = z.string().nullable();
const integerSchema = z.number().int();
const nullableIntegerSchema = integerSchema.nullable();

export const FileSchema = z.object({
  bucketKey: z.string(),
  bucketProvider: z.enum(DEFAULT_APP_BUCKET_PROVIDERS),
  byteSize: integerSchema,
  contentType: z.string(),
  createdAt: isoDateTimeSchema,
  deletedAt: nullableIsoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  id: z.string(),
  originalName: z.string(),
  safeName: z.string(),
  shopDomain: z.string(),
  status: z.enum(FILE_STATUS_VALUES),
  updatedAt: isoDateTimeSchema,
});

export type File = z.infer<typeof FileSchema>;

export const ProductExportSchema = z.object({
  bucketKey: nullableStringSchema,
  bucketProvider: nullableStringSchema,
  completedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  deletedAt: nullableIsoDateTimeSchema,
  errorCode: nullableStringSchema,
  errorMessage: nullableStringSchema,
  fileSize: nullableIntegerSchema,
  id: z.string(),
  name: z.string(),
  objectCount: nullableIntegerSchema,
  partialDataUrl: nullableStringSchema,
  resultUrl: nullableStringSchema,
  shopDomain: z.string(),
  shopifyBulkOperationId: nullableStringSchema,
  shopifyBulkOperationStatus: nullableStringSchema,
  shopifySessionId: nullableStringSchema,
  status: z.enum(PRODUCT_EXPORT_STATUS_VALUES),
  template: z.enum(PRODUCT_EXPORT_TEMPLATE_CODE_VALUES),
  updatedAt: isoDateTimeSchema,
});

export type ProductExport = z.infer<typeof ProductExportSchema>;

export const ProductExportPartSchema = z.object({
  attempts: integerSchema,
  bucketKey: nullableStringSchema,
  bucketProvider: nullableStringSchema,
  byteSize: nullableIntegerSchema,
  completedAt: nullableIsoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  errorCode: nullableStringSchema,
  errorMessage: nullableStringSchema,
  exportId: z.string(),
  id: z.string(),
  lockedAt: nullableIsoDateTimeSchema,
  rangeEnd: integerSchema,
  rangeStart: integerSchema,
  rowCount: nullableIntegerSchema,
  seq: integerSchema,
  status: z.enum(PRODUCT_EXPORT_PART_STATUS_VALUES),
  updatedAt: isoDateTimeSchema,
});

export type ProductExportPart = z.infer<typeof ProductExportPartSchema>;

export const ReferenceSchema = z.object({
  code: z.string(),
  createdAt: isoDateTimeSchema,
  deletedAt: nullableIsoDateTimeSchema,
  enabled: z.boolean(),
  id: z.string(),
  label: z.string(),
  namespace: z.string(),
  shopDomain: z.string(),
  sortOrder: z.number().int(),
  system: z.boolean(),
  updatedAt: isoDateTimeSchema,
});

export type Reference = z.infer<typeof ReferenceSchema>;

export const ShopifySessionSchema = z.object({
  accessToken: z.string(),
  accountOwner: z.boolean().nullable(),
  collaborator: z.boolean().nullable(),
  email: nullableStringSchema,
  emailVerified: z.boolean().nullable(),
  expires: nullableIsoDateTimeSchema,
  firstName: nullableStringSchema,
  id: z.string(),
  isOnline: z.boolean(),
  lastName: nullableStringSchema,
  locale: nullableStringSchema,
  refreshToken: nullableStringSchema,
  refreshTokenExpires: nullableIsoDateTimeSchema,
  scope: nullableStringSchema,
  shop: z.string(),
  state: z.string(),
  userId: nullableIntegerSchema,
});

export type ShopifySession = z.infer<typeof ShopifySessionSchema>;
