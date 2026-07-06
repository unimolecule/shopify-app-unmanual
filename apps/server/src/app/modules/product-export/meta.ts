import { createRoute, z } from "@hono/zod-openapi";
import { shopifyAdminSession } from "@/app/modules/shopify/mode";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";
import {
  CreateProductExportBodySchema,
  ProductExportDownloadTargetSchema,
  ProductExportIdParamsSchema,
  ProductExportListQuerySchema,
  ProductExportListSchema,
  ProductExportSchema,
  ProductExportTemplateListSchema,
} from "./schema";

export const createProductExportRoute = createRoute({
  method: "post",
  path: apiPath,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Create product export",
  description:
    "Create a product export and start a Shopify Bulk Operation for all products.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateProductExportBodySchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: "Product export accepted.",
      content: {
        "application/json": {
          schema: ResponseSchema(ProductExportSchema),
        },
      },
    },
    401: {
      description: "Missing or invalid Shopify session token.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    502: {
      description: "Shopify Admin API request failed.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const listProductExportsRoute = createRoute({
  method: "get",
  path: apiPath,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "List product exports",
  description: "List product exports for the current Shopify shop.",
  request: {
    query: ProductExportListQuerySchema,
  },
  responses: {
    200: {
      description: "Product export list.",
      content: {
        "application/json": {
          schema: ResponseSchema(ProductExportListSchema),
        },
      },
    },
  },
});

export const listProductExportTemplatesRoute = createRoute({
  method: "get",
  path: `${apiPath}/reference/templates`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "List product export templates",
  description: "List product export file templates supported by the server.",
  responses: {
    200: {
      description: "Product export template list.",
      content: {
        "application/json": {
          schema: ResponseSchema(ProductExportTemplateListSchema),
        },
      },
    },
    401: {
      description: "Missing or invalid Shopify session token.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const getProductExportRoute = createRoute({
  method: "get",
  path: `${apiPath}/{id}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Get product export",
  description: "Get one product export for the current Shopify shop.",
  request: {
    params: ProductExportIdParamsSchema,
  },
  responses: {
    200: {
      description: "Product export.",
      content: {
        "application/json": {
          schema: ResponseSchema(ProductExportSchema),
        },
      },
    },
    404: {
      description: "Product export not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const downloadProductExportRoute = createRoute({
  method: "get",
  path: `${apiPath}/{id}/download`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Download product export",
  description: "Download the generated CSV for a ready product export.",
  request: {
    params: ProductExportIdParamsSchema,
  },
  responses: {
    200: {
      description: "Product export CSV.",
      content: {
        "application/json": {
          schema: ResponseSchema(ProductExportDownloadTargetSchema),
        },
        "text/csv": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
    302: {
      description: "Redirect to a short-lived product export CSV URL.",
    },
    404: {
      description: "Product export file not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const deleteProductExportRoute = createRoute({
  method: "delete",
  path: `${apiPath}/{id}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Delete product export",
  description: "Cancel and soft-delete one product export.",
  request: {
    params: ProductExportIdParamsSchema,
  },
  responses: {
    204: {
      description: "Product export deleted.",
    },
    404: {
      description: "Product export not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});
