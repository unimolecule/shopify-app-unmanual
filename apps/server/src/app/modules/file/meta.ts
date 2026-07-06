import { createRoute, z } from "@hono/zod-openapi";
import { shopifyAdminSession } from "@/app/modules/shopify/mode";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";
import {
  FileIdParamsSchema,
  FileListQuerySchema,
  FileListSchema,
  FileSchema,
  FileUploadListSchema,
} from "./schema";

export const createFileRoute = createRoute({
  method: "post",
  path: apiPath,
  middleware: [shopifyAdminSession()],
  tags,
  summary: "Create file",
  description:
    "Upload one raw file with X-File-Name or multiple files using multipart/form-data fields named files or files[].",
  request: {
    headers: z.object({
      "x-file-name": z.string().openapi({
        description: "Original filename.",
        example: "invoice.pdf",
      }),
    }),
  },
  responses: {
    201: {
      description: "File created.",
      content: {
        "application/json": {
          schema: ResponseSchema(z.union([FileSchema, FileUploadListSchema])),
        },
      },
    },
    400: {
      description: "Invalid upload request.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
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
    413: {
      description: "File exceeds configured maximum size.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const listFilesRoute = createRoute({
  method: "get",
  path: apiPath,
  middleware: [shopifyAdminSession()],
  tags,
  summary: "List files",
  description: "List files for the current Shopify shop.",
  request: {
    query: FileListQuerySchema,
  },
  responses: {
    200: {
      description: "Files list.",
      content: {
        "application/json": {
          schema: ResponseSchema(FileListSchema),
        },
      },
    },
  },
});

export const getFileRoute = createRoute({
  method: "get",
  path: `${apiPath}/{id}`,
  middleware: [shopifyAdminSession()],
  tags,
  summary: "Get file",
  description: "Get file metadata for the current Shopify shop.",
  request: {
    params: FileIdParamsSchema,
  },
  responses: {
    200: {
      description: "File metadata.",
      content: {
        "application/json": {
          schema: ResponseSchema(FileSchema),
        },
      },
    },
    404: {
      description: "File not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    410: {
      description: "File expired.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const downloadFileRoute = createRoute({
  method: "get",
  path: `${apiPath}/{id}/download`,
  middleware: [shopifyAdminSession()],
  tags,
  summary: "Download file",
  description: "Download a file for the current Shopify shop.",
  request: {
    params: FileIdParamsSchema,
  },
  responses: {
    200: {
      description: "File content.",
      content: {
        "application/octet-stream": {
          schema: z.string().openapi({ format: "binary" }),
        },
      },
    },
    302: {
      description: "Redirect to a short-lived file URL.",
    },
    404: {
      description: "File not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    410: {
      description: "File expired.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const deleteFileRoute = createRoute({
  method: "delete",
  path: `${apiPath}/{id}`,
  middleware: [shopifyAdminSession()],
  tags,
  summary: "Delete file",
  description: "Delete a file for the current Shopify shop.",
  request: {
    params: FileIdParamsSchema,
  },
  responses: {
    204: {
      description: "File deleted.",
    },
    404: {
      description: "File not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});
