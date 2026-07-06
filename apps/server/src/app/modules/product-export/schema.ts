import { z } from "@hono/zod-openapi";
import { PRODUCT_EXPORT_STATUS_VALUES } from "@unimolecule/shopify-app-unmanual-database/constants";
import { ProductExportSchema as DatabaseProductExportSchema } from "@unimolecule/shopify-app-unmanual-database/entities/plain-zod-schema";
import { PaginationQuerySchema, PaginationSchema } from "@/shared/models";
import { PRODUCT_EXPORT_TEMPLATE_CODES } from "./templates";
import { PRODUCT_EXPORT_STATUSES } from "./utils";

export const ProductExportStatusSchema = z.enum(PRODUCT_EXPORT_STATUS_VALUES);
export const ProductExportTemplateCodeSchema = z.enum(
  PRODUCT_EXPORT_TEMPLATE_CODES,
);

export const ProductExportSchema = DatabaseProductExportSchema.extend({
  bucketKey: DatabaseProductExportSchema.shape.bucketKey.openapi({
    description: "Bucket key for the generated CSV file.",
    example:
      "test-shop.myshopify.com/product-exports/2026/06/export-id/products.csv",
  }),
  bucketProvider: DatabaseProductExportSchema.shape.bucketProvider.openapi({
    description: "Bucket provider used to store the generated CSV file.",
    example: "r2",
  }),
  completedAt: z.iso.datetime().nullable().openapi({
    description: "Completion timestamp.",
    example: null,
  }),
  createdAt: z.iso.datetime().openapi({
    description: "Creation timestamp.",
    example: "2026-06-18T12:00:00.000Z",
  }),
  deletedAt: z.iso.datetime().nullable().openapi({
    description: "Soft deletion timestamp.",
    example: null,
  }),
  id: DatabaseProductExportSchema.shape.id.openapi({
    description: "Product export ID.",
    example: "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
  }),
  name: DatabaseProductExportSchema.shape.name.openapi({
    description: "Merchant-facing export name.",
    example: "All products",
  }),
  shopDomain: DatabaseProductExportSchema.shape.shopDomain.openapi({
    description: "Shopify shop domain that owns the export.",
    example: "test-shop.myshopify.com",
  }),
  shopifyBulkOperationId:
    DatabaseProductExportSchema.shape.shopifyBulkOperationId.openapi({
      description: "Shopify BulkOperation GraphQL ID.",
      example: "gid://shopify/BulkOperation/1234567890",
    }),
  shopifySessionId: DatabaseProductExportSchema.shape.shopifySessionId.openapi({
    description: "Offline Shopify session ID used to start the export.",
    example: "offline_test-shop.myshopify.com",
  }),
  status: ProductExportStatusSchema.openapi({
    description: "Product export lifecycle status.",
    example: PRODUCT_EXPORT_STATUSES.BULK_OPERATION_RUNNING,
  }),
  template: ProductExportTemplateCodeSchema.openapi({
    description: "Product export file template code.",
    example: "basic",
  }),
  updatedAt: z.iso.datetime().openapi({
    description: "Update timestamp.",
    example: "2026-06-18T12:00:00.000Z",
  }),
}).openapi({
  description: "Product export metadata.",
});

export const CreateProductExportBodySchema = z.object({
  name: z.string().min(1).max(120).openapi({
    description: "Export name.",
    example: "All products",
  }),
  template: ProductExportTemplateCodeSchema.openapi({
    description: "Export file template.",
    example: "basic",
  }),
});

export const ProductExportTemplateSchema = z.object({
  code: ProductExportTemplateCodeSchema.openapi({
    description: "Stable template code.",
    example: "basic",
  }),
  fields: z.array(z.string()).openapi({
    description: "Shopify Product fields exported by this template.",
    example: [
      "id",
      "productId",
      "title",
      "handle",
      "status",
      "vendor",
      "productType",
      "createdAt",
      "updatedAt",
    ],
  }),
  label: z.string().openapi({
    description: "Human-readable template label.",
    example: "Basic",
  }),
});

export const ProductExportTemplateListSchema = z.array(
  ProductExportTemplateSchema,
);

export const ProductExportListSchema = z.object({
  pagination: PaginationSchema,
  result: z.array(ProductExportSchema),
});

export const ProductExportDownloadTargetSchema = z.object({
  type: z.enum(["redirect", "stream"]).openapi({
    description: "Browser download strategy for the generated CSV.",
    example: "redirect",
  }),
  url: z.string().url().openapi({
    description:
      "Download URL. Redirect URLs may point to short-lived R2 URLs.",
    example: "https://signed.example.com/products.csv",
  }),
});

export const ProductExportIdParamsSchema = z.object({
  id: z.string().min(1).openapi({
    description: "Product export ID.",
    example: "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
  }),
});

export const ProductExportListQuerySchema = PaginationQuerySchema.extend({
  status: ProductExportStatusSchema.optional().openapi({
    description: "Filter by export status.",
    example: PRODUCT_EXPORT_STATUSES.READY,
  }),
});
