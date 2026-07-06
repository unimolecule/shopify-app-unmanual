import { z } from "@hono/zod-openapi";
import { FileSchema as DatabaseFileSchema } from "@shamt/database/entities/plain-zod-schema";
import { PaginationQuerySchema, PaginationSchema } from "@/shared/models";

export const FileStatusSchema = DatabaseFileSchema.shape.status;

export const FileSchema = DatabaseFileSchema.extend({
  bucketKey: DatabaseFileSchema.shape.bucketKey.openapi({
    description: "Bucket object key.",
    example:
      "test-shop.myshopify.com/2026/06/8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a/invoice.pdf",
  }),
  bucketProvider: DatabaseFileSchema.shape.bucketProvider.openapi({
    description: "Bucket provider used to store the file.",
    example: "memory",
  }),
  byteSize: DatabaseFileSchema.shape.byteSize.nonnegative().openapi({
    description: "Uploaded file size in bytes.",
    example: 1024,
  }),
  contentType: DatabaseFileSchema.shape.contentType.openapi({
    description: "Uploaded file MIME type.",
    example: "application/pdf",
  }),
  createdAt: z.iso.datetime().openapi({
    description: "File creation timestamp.",
    example: "2026-06-13T12:00:00.000Z",
  }),
  deletedAt: z.iso.datetime().nullable().openapi({
    description: "File deletion timestamp.",
    example: null,
  }),
  expiresAt: z.iso.datetime().openapi({
    description: "File expiration timestamp.",
    example: "2026-06-14T12:00:00.000Z",
  }),
  id: DatabaseFileSchema.shape.id.openapi({
    description: "File resource ID.",
    example: "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
  }),
  originalName: DatabaseFileSchema.shape.originalName.openapi({
    description: "Original uploaded filename.",
    example: "invoice.pdf",
  }),
  safeName: DatabaseFileSchema.shape.safeName.openapi({
    description: "Sanitized filename used for storage path suffix.",
    example: "invoice.pdf",
  }),
  shopDomain: DatabaseFileSchema.shape.shopDomain.openapi({
    description: "Shopify shop domain that owns the file.",
    example: "test-shop.myshopify.com",
  }),
  status: FileStatusSchema.openapi({
    description: "File lifecycle status.",
    example: "available",
  }),
  updatedAt: z.iso.datetime().openapi({
    description: "File update timestamp.",
    example: "2026-06-13T12:00:00.000Z",
  }),
}).openapi({
  description: "Public file metadata.",
});

export const FileListSchema = z.object({
  pagination: PaginationSchema,
  result: z.array(FileSchema),
});

export const FileUploadListSchema = z.object({
  files: z.array(FileSchema),
});

export const FileIdParamsSchema = z.object({
  id: z.string().min(1).openapi({
    description: "File resource ID.",
    example: "8f07a37b-b7dc-41f0-a9d5-3f9c28e12f2a",
  }),
});

export const FileListQuerySchema = PaginationQuerySchema;
