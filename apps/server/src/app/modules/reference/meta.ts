import { createRoute, z } from "@hono/zod-openapi";
import { shopifyAdminSession } from "@/app/modules/shopify/mode";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";
import {
  CreateReferenceBodySchema,
  ReferenceIdParamsSchema,
  ReferenceListQuerySchema,
  ReferenceListSchema,
  ReferenceNamespaceParamsSchema,
  ReferenceSchema,
  UpdateReferenceBodySchema,
} from "./schema";

export const listReferencesRoute = createRoute({
  method: "get",
  path: `${apiPath}/{namespace}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "List references",
  description: "List references for a shop-scoped namespace.",
  request: {
    params: ReferenceNamespaceParamsSchema,
    query: ReferenceListQuerySchema,
  },
  responses: {
    200: {
      description: "Reference list.",
      content: {
        "application/json": {
          schema: ResponseSchema(ReferenceListSchema),
        },
      },
    },
  },
});

export const createReferenceRoute = createRoute({
  method: "post",
  path: `${apiPath}/{namespace}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Create reference",
  description: "Create one reference for a shop-scoped namespace.",
  request: {
    params: ReferenceNamespaceParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: CreateReferenceBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Reference created.",
      content: {
        "application/json": {
          schema: ResponseSchema(ReferenceSchema),
        },
      },
    },
    409: {
      description: "Reference already exists.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const getReferenceRoute = createRoute({
  method: "get",
  path: `${apiPath}/{namespace}/{id}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Get reference",
  description: "Get one reference for a shop-scoped namespace.",
  request: {
    params: ReferenceIdParamsSchema,
  },
  responses: {
    200: {
      description: "Reference.",
      content: {
        "application/json": {
          schema: ResponseSchema(ReferenceSchema),
        },
      },
    },
    404: {
      description: "Reference not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const updateReferenceRoute = createRoute({
  method: "patch",
  path: `${apiPath}/{namespace}/{id}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Update reference",
  description: "Update one reference for a shop-scoped namespace.",
  request: {
    params: ReferenceIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: UpdateReferenceBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Reference updated.",
      content: {
        "application/json": {
          schema: ResponseSchema(ReferenceSchema),
        },
      },
    },
    404: {
      description: "Reference not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    409: {
      description: "Reference already exists.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const deleteReferenceRoute = createRoute({
  method: "delete",
  path: `${apiPath}/{namespace}/{id}`,
  middleware: [shopifyAdminSession()] as const,
  tags,
  summary: "Delete reference",
  description: "Soft-delete one reference for a shop-scoped namespace.",
  request: {
    params: ReferenceIdParamsSchema,
  },
  responses: {
    204: {
      description: "Reference deleted.",
    },
    404: {
      description: "Reference not found.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});
